import { AppConfig } from '../config/config';
import { downloadPdf } from '../downloader/pdf-downloader';
import { RetryOptions, withRetries } from '../http/retry';
import { JudicialDocument, ScrapeSummary } from '../models/document';
import { CheckpointStorage } from '../storage/checkpoint-storage';
import { DocumentStorage } from '../storage/document-storage';
import { FailedDownloadStorage } from '../storage/failed-download-storage';
import { delay } from '../utils/delay';
import { logger } from '../utils/logger';
import { fetchResultsPage, ViewExpiredError } from './paginator';
import { extractViewState, parseRecords } from './parser';
import { buildSearchKey, submitSearch } from './search';
import { ScraperSession } from './session';

export class Scraper {
  private session: ScraperSession;

  private readonly documents: DocumentStorage;

  private readonly failures: FailedDownloadStorage;

  private readonly checkpoints: CheckpointStorage;

  private dataScrollerId: string | null = null;

  private stopRequested = false;

  private readonly summary: ScrapeSummary = {
    pagesProcessed: 0,
    documentsFound: 0,
    uniqueDocuments: 0,
    pdfsDownloaded: 0,
    pdfsSkipped: 0,
    failedDownloads: 0,
    durationMs: 0,
  };

  constructor(private readonly config: AppConfig) {
    this.session = new ScraperSession(config);
    this.documents = new DocumentStorage(config.outputDir);
    this.failures = new FailedDownloadStorage(config.outputDir);
    this.checkpoints = new CheckpointStorage(config.outputDir);
  }

  requestStop(): void {
    this.stopRequested = true;
  }

  persist(): void {
    this.documents.save();
    this.failures.save();
  }

  private get retryOptions(): RetryOptions {
    return {
      maxRetries: this.config.maxRetries,
      backoffBaseMs: this.config.backoffBaseMs,
      backoffMaxMs: this.config.backoffMaxMs,
    };
  }

  /**
   * Inicializa sesión y envía la búsqueda; devuelve el HTML de la página 1.
   * El portal responde 500 de forma intermitente al POST de búsqueda, por lo
   * que cada reintento reconstruye la sesión completa (cookie + ViewState).
   */
  private async startSearch(): Promise<{ html: string; totalPages: number | null; totalResults: number | null }> {
    return withRetries(
      async () => {
        this.session = new ScraperSession(this.config);
        const inicioHtml = await this.session.initialize();
        const { html, info } = await submitSearch(this.session, this.config, inicioHtml);
        this.dataScrollerId = info.dataScrollerId;
        this.session.updateViewState(extractViewState(html));
        return { html, totalPages: info.totalPages, totalResults: info.totalResults };
      },
      this.retryOptions,
      (attempt, waitMs) => logger.warn(`Search request failed - retry ${attempt} in ${Math.round(waitMs)}ms`),
    );
  }

  /** Reconstruye sesión + búsqueda tras una expiración de vista JSF. */
  private async reinitialize(): Promise<void> {
    logger.warn('Session expired - reinitializing');
    this.session = new ScraperSession(this.config);
    await this.startSearch();
  }

  async run(): Promise<ScrapeSummary> {
    const startedAt = Date.now();
    const searchKey = buildSearchKey(this.config);

    const { html, totalPages, totalResults } = await this.startSearch();

    const checkpoint = this.checkpoints.load(searchKey);
    let startPage = 1;
    if (checkpoint && checkpoint.lastCompletedPage >= 1) {
      startPage = checkpoint.lastCompletedPage + 1;
      logger.info(`Resuming from checkpoint - continuing at page ${startPage}`);
    }

    const lastPage = Math.min(
      totalPages ?? Number.MAX_SAFE_INTEGER,
      this.config.maxPages !== null ? startPage - 1 + this.config.maxPages : Number.MAX_SAFE_INTEGER,
    );
    logger.info(
      `Total results: ${totalResults ?? '?'} - total pages: ${totalPages ?? '?'} - processing pages ${startPage}..${lastPage}`,
    );

    let previousPageUuids = new Set<string>();

    for (let page = startPage; page <= lastPage; page += 1) {
      if (this.stopRequested) break;
      let records: JudicialDocument[];
      if (page === 1) {
        records = parseRecords(html, 1);
      } else {
        await delay(this.config.requestDelayMs);
        try {
          records = await this.fetchPageWithRetryOnExpiry(page);
        } catch (error) {
          logger.error(`Page ${page} failed: ${error instanceof Error ? error.message : String(error)}`);
          break;
        }
      }

      if (records.length === 0) {
        logger.info(`Page ${page} returned no records - stopping`);
        break;
      }

      const currentUuids = new Set(records.map((r) => r.uuid));
      if (page > startPage && setsEqual(currentUuids, previousPageUuids)) {
        logger.error(`Page ${page} repeats the previous page - aborting to avoid an infinite loop`);
        break;
      }
      previousPageUuids = currentUuids;

      const newDocs = this.documents.add(records);
      this.summary.pagesProcessed += 1;
      this.summary.documentsFound += records.length;
      logger.info(`Page ${page} parsed - ${records.length} documents (${newDocs.length} new)`);

      if (this.config.downloadPdfs) {
        await this.downloadBatch(newDocs);
      }

      this.persist();
      this.checkpoints.save({
        searchKey,
        lastCompletedPage: page,
        totalPages,
        totalResults,
        updatedAt: new Date().toISOString(),
      });

      if (this.config.maxDocuments !== null && this.documents.count >= this.config.maxDocuments) {
        logger.info(`Configured document limit reached (${this.config.maxDocuments})`);
        break;
      }
    }

    this.persist();
    this.summary.uniqueDocuments = this.documents.count;
    this.summary.failedDownloads = this.failures.count;
    this.summary.durationMs = Date.now() - startedAt;
    return this.summary;
  }

  private async fetchPageWithRetryOnExpiry(page: number): Promise<JudicialDocument[]> {
    if (!this.dataScrollerId) {
      throw new Error('No se identificó el DataScroller de paginación en la página de resultados');
    }
    const fetchWithRetries = (scrollerId: string): Promise<JudicialDocument[]> =>
      withRetries(
        () => fetchResultsPage(this.session, scrollerId, page),
        this.retryOptions,
        (attempt, waitMs) => logger.warn(`Page ${page} request failed - retry ${attempt} in ${Math.round(waitMs)}ms`),
      );
    try {
      return await fetchWithRetries(this.dataScrollerId);
    } catch (error) {
      if (!(error instanceof ViewExpiredError)) throw error;
      await this.reinitialize();
      if (!this.dataScrollerId) {
        throw new Error('No se pudo recuperar el paginador tras reinicializar la sesión');
      }
      return fetchWithRetries(this.dataScrollerId);
    }
  }

  private async downloadBatch(docs: JudicialDocument[]): Promise<void> {
    let index = 0;
    for (const doc of docs) {
      if (this.stopRequested) return;
      index += 1;
      if (this.config.maxDocuments !== null && this.summary.pdfsDownloaded >= this.config.maxDocuments) {
        return;
      }
      logger.info(`Downloading document ${index}/${docs.length} (${doc.expediente})`);
      const result = await downloadPdf(this.session.http.client, doc, this.config);
      if (result.outcome === 'downloaded') {
        this.summary.pdfsDownloaded += 1;
        this.failures.remove(doc.uuid);
        logger.info('PDF downloaded');
      } else if (result.outcome === 'skipped') {
        this.summary.pdfsSkipped += 1;
      } else if (result.failure) {
        this.failures.record(result.failure);
      }
      await delay(this.config.requestDelayMs);
    }
  }
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) {
    if (!b.has(value)) return false;
  }
  return true;
}

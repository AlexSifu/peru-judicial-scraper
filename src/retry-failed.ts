import { loadConfig } from './config/config';
import { downloadPdf } from './downloader/pdf-downloader';
import { createHttpSession } from './http/client';
import { JudicialDocument } from './models/document';
import { DocumentStorage } from './storage/document-storage';
import { FailedDownloadStorage } from './storage/failed-download-storage';
import { delay } from './utils/delay';
import { logger, setLogLevel } from './utils/logger';

/**
 * Reintenta únicamente las descargas registradas en failed-downloads.json.
 * Las que se recuperan se eliminan del listado; las que siguen fallando
 * se conservan con su información actualizada.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const failures = new FailedDownloadStorage(config.outputDir);
  const documents = new DocumentStorage(config.outputDir);
  const pending = failures.all();
  if (pending.length === 0) {
    logger.info('No failed downloads to retry');
    return;
  }
  logger.info(`Retrying ${pending.length} failed downloads`);

  const { client } = createHttpSession(config.requestTimeoutMs);
  const byUuid = new Map(documents.all().map((doc) => [doc.uuid, doc]));

  let recovered = 0;
  for (const failure of pending) {
    const doc: JudicialDocument | undefined = byUuid.get(failure.documentId);
    if (!doc) {
      logger.warn(`Document ${failure.documentId} not found in documents.json - keeping in failed list`);
      continue;
    }
    logger.info(`Retrying ${doc.expediente}`);
    const result = await downloadPdf(client, doc, config);
    if (result.outcome === 'downloaded' || result.outcome === 'skipped') {
      failures.remove(failure.documentId);
      recovered += 1;
      logger.info('PDF downloaded');
    } else if (result.failure) {
      failures.record(result.failure);
    }
    await delay(config.requestDelayMs);
  }

  failures.save();
  logger.info(`Retry finished - recovered: ${recovered}, still failing: ${failures.count}`);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

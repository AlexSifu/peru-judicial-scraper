import { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { AppConfig } from '../config/config';
import { computeBackoffMs, getRetryAfterMs, getStatus, isRetryableError } from '../http/retry';
import { FailedDownload, JudicialDocument } from '../models/document';
import { delay } from '../utils/delay';
import { buildPdfFilename } from '../utils/filename';
import { logger } from '../utils/logger';

export type DownloadOutcome = 'downloaded' | 'skipped' | 'failed';

const PDF_MAGIC = '%PDF-';

/**
 * Nombre determinístico del PDF. Incluye un fragmento del uuid porque
 * distintas resoluciones pueden compartir expediente, tipo y fecha.
 */
export function pdfFilenameFor(doc: JudicialDocument): string {
  const base = buildPdfFilename(doc.expediente, doc.tipoResolucion, doc.fechaResolucion);
  return base.replace(/\.pdf$/, `_${doc.uuid.slice(0, 8)}.pdf`);
}

function fileStartsWithPdfMagic(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(PDF_MAGIC.length);
    const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
    return bytesRead === buffer.length && buffer.toString('latin1') === PDF_MAGIC;
  } finally {
    fs.closeSync(fd);
  }
}

export interface DownloadResult {
  outcome: DownloadOutcome;
  failure?: FailedDownload;
}

/**
 * Descarga el PDF de un documento con streaming a archivo temporal,
 * validación de firma %PDF- y rename atómico. Reintenta errores
 * transitorios (429/5xx/red) respetando Retry-After y backoff exponencial.
 */
export async function downloadPdf(
  client: AxiosInstance,
  doc: JudicialDocument,
  config: AppConfig,
): Promise<DownloadResult> {
  fs.mkdirSync(config.pdfDir, { recursive: true });
  const filename = pdfFilenameFor(doc);
  const finalPath = path.join(config.pdfDir, filename);
  if (fs.existsSync(finalPath)) {
    return { outcome: 'skipped' };
  }
  const tmpPath = `${finalPath}.tmp`;
  const url = new URL(doc.pdfUrl, config.baseUrl).toString();

  let lastError = 'desconocido';
  let lastStatus: number | null = null;
  let attemptsUsed = 0;

  for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
    attemptsUsed = attempt + 1;
    if (attempt > 0) {
      logger.info('Waiting before retry');
    }
    try {
      const response = await client.get<Readable>(url, {
        responseType: 'stream',
        headers: { Accept: 'application/pdf,application/octet-stream,*/*' },
      });
      await pipeline(response.data, fs.createWriteStream(tmpPath));

      if (!fileStartsWithPdfMagic(tmpPath)) {
        // El servidor respondió 200 con HTML (error/sesión); no es un PDF.
        fs.unlinkSync(tmpPath);
        lastError = 'La respuesta no es un PDF válido (firma %PDF- ausente)';
        lastStatus = response.status;
        logger.warn(`Invalid PDF content for ${doc.expediente} - retry ${attempt + 1}/${config.maxRetries}`);
      } else {
        fs.renameSync(tmpPath, finalPath);
        return { outcome: 'downloaded' };
      }
    } catch (error) {
      if (fs.existsSync(tmpPath)) {
        fs.unlinkSync(tmpPath);
      }
      lastStatus = getStatus(error);
      lastError = error instanceof Error ? error.message : String(error);
      if (!isRetryableError(error)) {
        logger.error(`Download failed (non-retryable, HTTP ${lastStatus ?? 'n/a'}): ${doc.expediente}`);
        break;
      }
      if (lastStatus === 429) {
        logger.warn(`HTTP 429 - retry ${attempt + 1}/${config.maxRetries}`);
      } else {
        logger.warn(`HTTP ${lastStatus ?? lastError} - retry ${attempt + 1}/${config.maxRetries}`);
      }
      const retryAfterMs = getRetryAfterMs(error);
      const waitMs = retryAfterMs ?? computeBackoffMs(attempt, config.backoffBaseMs, config.backoffMaxMs);
      if (attempt < config.maxRetries) {
        await delay(waitMs);
      }
      continue;
    }
    // Contenido inválido con HTTP 200: aplicar backoff antes de reintentar.
    if (attempt < config.maxRetries) {
      await delay(computeBackoffMs(attempt, config.backoffBaseMs, config.backoffMaxMs));
    }
  }

  const failure: FailedDownload = {
    documentId: doc.uuid,
    expediente: doc.expediente,
    pdfUrl: doc.pdfUrl,
    status: lastStatus,
    attempts: attemptsUsed,
    error: lastError,
    failedAt: new Date().toISOString(),
  };
  logger.error(`Download failed after ${attemptsUsed} attempts: ${doc.expediente}`);
  return { outcome: 'failed', failure };
}

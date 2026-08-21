import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

export interface AppConfig {
  baseUrl: string;
  outputDir: string;
  pdfDir: string;
  requestTimeoutMs: number;
  requestDelayMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
  maxPages: number | null;
  maxDocuments: number | null;
  downloadPdfs: boolean;
  /** Año de resolución usado como criterio de búsqueda (el portal exige al menos un criterio). */
  searchYear: string;
  /** Texto libre opcional buscado dentro de las resoluciones. */
  searchText: string;
  logLevel: 'debug' | 'info';
}

function envStr(name: string, fallback: string): string {
  const value = process.env[name];
  return value !== undefined && value !== '' ? value : fallback;
}

function envInt(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    throw new Error(`Valor inválido para ${name}: "${value}"`);
  }
  return parsed;
}

function envOptionalInt(name: string): number | null {
  const value = process.env[name];
  if (value === undefined || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    throw new Error(`Valor inválido para ${name}: "${value}"`);
  }
  return parsed;
}

function envBool(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

/** Sobrescrituras por CLI: --max-pages=2 --max-documents=10 --download-pdfs=false */
export function parseCliOverrides(argv: string[]): Partial<AppConfig> {
  const overrides: Partial<AppConfig> = {};
  for (const arg of argv) {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg);
    if (!match) continue;
    const [, key, raw] = match;
    switch (key) {
      case 'max-pages':
        overrides.maxPages = Number.parseInt(raw, 10);
        break;
      case 'max-documents':
        overrides.maxDocuments = Number.parseInt(raw, 10);
        break;
      case 'download-pdfs':
        overrides.downloadPdfs = raw.toLowerCase() === 'true';
        break;
      case 'search-year':
        overrides.searchYear = raw;
        break;
      case 'search-text':
        overrides.searchText = raw;
        break;
      default:
        break;
    }
  }
  const { maxPages, maxDocuments } = overrides;
  if (maxPages !== undefined && (maxPages === null || Number.isNaN(maxPages) || maxPages <= 0)) {
    throw new Error('--max-pages debe ser un entero positivo');
  }
  if (maxDocuments !== undefined && (maxDocuments === null || Number.isNaN(maxDocuments) || maxDocuments <= 0)) {
    throw new Error('--max-documents debe ser un entero positivo');
  }
  return overrides;
}

export function loadConfig(argv: string[] = process.argv.slice(2)): AppConfig {
  const outputDir = path.resolve(envStr('OUTPUT_DIR', './data'));
  const base: AppConfig = {
    baseUrl: envStr('BASE_URL', 'https://jurisprudencia.pj.gob.pe/jurisprudenciaweb'),
    outputDir,
    pdfDir: path.resolve(envStr('PDF_DIR', path.join(outputDir, 'pdfs'))),
    requestTimeoutMs: envInt('REQUEST_TIMEOUT_MS', 30000),
    requestDelayMs: envInt('REQUEST_DELAY_MS', 1000),
    maxRetries: envInt('MAX_RETRIES', 5),
    backoffBaseMs: envInt('BACKOFF_BASE_MS', 1000),
    backoffMaxMs: envInt('BACKOFF_MAX_MS', 60000),
    maxPages: envOptionalInt('MAX_PAGES'),
    maxDocuments: envOptionalInt('MAX_DOCUMENTS'),
    downloadPdfs: envBool('DOWNLOAD_PDFS', true),
    searchYear: envStr('SEARCH_YEAR', '2024'),
    searchText: envStr('SEARCH_TEXT', ''),
    logLevel: envStr('LOG_LEVEL', 'info') === 'debug' ? 'debug' : 'info',
  };
  return { ...base, ...parseCliOverrides(argv) };
}

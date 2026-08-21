import { loadConfig } from './config/config';
import { Scraper } from './scraper/scraper';
import { logger, setLogLevel } from './utils/logger';

async function main(): Promise<void> {
  const config = loadConfig();
  setLogLevel(config.logLevel);

  const scraper = new Scraper(config);

  const handleSignal = (signal: string): void => {
    logger.warn(`${signal} received - persisting progress before exit`);
    scraper.requestStop();
  };
  process.on('SIGINT', () => handleSignal('SIGINT'));
  process.on('SIGTERM', () => handleSignal('SIGTERM'));

  const summary = await scraper.run();

  logger.info('Scraping completed');
  logger.info(`Pages processed: ${summary.pagesProcessed}`);
  logger.info(`Documents found: ${summary.documentsFound}`);
  logger.info(`Unique documents: ${summary.uniqueDocuments}`);
  logger.info(`PDFs downloaded: ${summary.pdfsDownloaded}`);
  logger.info(`PDFs skipped: ${summary.pdfsSkipped}`);
  logger.info(`Failed downloads: ${summary.failedDownloads}`);
  logger.info(`Duration: ${(summary.durationMs / 1000).toFixed(1)}s`);
}

main().catch((error: unknown) => {
  logger.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

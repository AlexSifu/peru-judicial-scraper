import * as fs from 'fs';
import * as path from 'path';
import { FailedDownload } from '../models/document';

export class FailedDownloadStorage {
  private readonly filePath: string;

  private readonly byId = new Map<string, FailedDownload>();

  constructor(outputDir: string) {
    this.filePath = path.join(outputDir, 'failed-downloads.json');
    fs.mkdirSync(outputDir, { recursive: true });
    this.load();
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && typeof (item as FailedDownload).documentId === 'string') {
            const failure = item as FailedDownload;
            this.byId.set(failure.documentId, failure);
          }
        }
      }
    } catch {
      // Archivo corrupto: se regenerará en el siguiente guardado.
    }
  }

  record(failure: FailedDownload): void {
    this.byId.set(failure.documentId, failure);
  }

  remove(documentId: string): void {
    this.byId.delete(documentId);
  }

  all(): FailedDownload[] {
    return [...this.byId.values()];
  }

  get count(): number {
    return this.byId.size;
  }

  save(): void {
    fs.writeFileSync(this.filePath, JSON.stringify(this.all(), null, 2), 'utf-8');
  }
}

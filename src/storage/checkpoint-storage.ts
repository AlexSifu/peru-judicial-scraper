import * as fs from 'fs';
import * as path from 'path';
import { Checkpoint } from '../models/document';

export class CheckpointStorage {
  private readonly filePath: string;

  constructor(outputDir: string) {
    this.filePath = path.join(outputDir, 'checkpoint.json');
    fs.mkdirSync(outputDir, { recursive: true });
  }

  /** Devuelve el checkpoint solo si corresponde a los mismos criterios de búsqueda. */
  load(searchKey: string): Checkpoint | null {
    if (!fs.existsSync(this.filePath)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Checkpoint;
      if (parsed && parsed.searchKey === searchKey && typeof parsed.lastCompletedPage === 'number') {
        return parsed;
      }
    } catch {
      // Checkpoint ilegible: se ignora y se empieza desde la primera página.
    }
    return null;
  }

  save(checkpoint: Checkpoint): void {
    fs.writeFileSync(this.filePath, JSON.stringify(checkpoint, null, 2), 'utf-8');
  }

  clear(): void {
    if (fs.existsSync(this.filePath)) {
      fs.unlinkSync(this.filePath);
    }
  }
}

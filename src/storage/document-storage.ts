import * as fs from 'fs';
import * as path from 'path';
import { JudicialDocument } from '../models/document';

const CSV_COLUMNS: Array<{ header: string; value: (d: JudicialDocument) => string }> = [
  { header: 'uuid', value: (d) => d.uuid },
  { header: 'recurso', value: (d) => d.recurso },
  { header: 'expediente', value: (d) => d.expediente },
  { header: 'pretensionDelito', value: (d) => d.pretensionDelito },
  { header: 'tipoResolucion', value: (d) => d.tipoResolucion },
  { header: 'fechaResolucion', value: (d) => d.fechaResolucion },
  { header: 'salaSuprema', value: (d) => d.salaSuprema },
  { header: 'normaDerechoInterno', value: (d) => d.normaDerechoInterno },
  { header: 'sumilla', value: (d) => d.sumilla },
  { header: 'palabrasClave', value: (d) => d.palabrasClave },
  { header: 'pdfUrl', value: (d) => d.pdfUrl },
  { header: 'pagina', value: (d) => String(d.pagina) },
];

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export class DocumentStorage {
  private readonly jsonPath: string;

  private readonly csvPath: string;

  private readonly byUuid = new Map<string, JudicialDocument>();

  constructor(outputDir: string) {
    this.jsonPath = path.join(outputDir, 'documents.json');
    this.csvPath = path.join(outputDir, 'documents.csv');
    fs.mkdirSync(outputDir, { recursive: true });
    this.loadExisting();
  }

  private loadExisting(): void {
    if (!fs.existsSync(this.jsonPath)) return;
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.jsonPath, 'utf-8'));
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && typeof item === 'object' && typeof (item as JudicialDocument).uuid === 'string') {
            const doc = item as JudicialDocument;
            this.byUuid.set(doc.uuid, doc);
          }
        }
      }
    } catch {
      // Archivo corrupto: se regenerará en el siguiente guardado.
    }
  }

  /** Agrega documentos deduplicando por uuid. Devuelve los realmente nuevos. */
  add(documents: JudicialDocument[]): JudicialDocument[] {
    const added: JudicialDocument[] = [];
    for (const doc of documents) {
      if (!this.byUuid.has(doc.uuid)) {
        this.byUuid.set(doc.uuid, doc);
        added.push(doc);
      }
    }
    return added;
  }

  has(uuid: string): boolean {
    return this.byUuid.has(uuid);
  }

  all(): JudicialDocument[] {
    return [...this.byUuid.values()];
  }

  get count(): number {
    return this.byUuid.size;
  }

  save(): void {
    const documents = this.all();
    fs.writeFileSync(this.jsonPath, JSON.stringify(documents, null, 2), 'utf-8');
    const rows = [CSV_COLUMNS.map((c) => c.header).join(',')];
    for (const doc of documents) {
      rows.push(CSV_COLUMNS.map((c) => csvEscape(c.value(doc))).join(','));
    }
    // BOM para que Excel abra el CSV como UTF-8.
    const crlf = String.fromCharCode(13) + String.fromCharCode(10);
    fs.writeFileSync(this.csvPath, String.fromCharCode(0xfeff) + rows.join(crlf) + crlf, 'utf-8');
  }
}

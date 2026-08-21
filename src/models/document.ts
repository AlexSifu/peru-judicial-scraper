/**
 * Campos reales observados en cada registro del portal de Jurisprudencia
 * Nacional Sistematizada (bloques `formBuscador:repeat:N` de resultado.xhtml).
 */
export interface JudicialDocument {
  /** UUID asignado por el portal (parámetro de ServletDescarga). Identificador único. */
  uuid: string;
  /** Tipo de recurso mostrado en la cabecera del registro (ej. "Apelación", "Casación"). */
  recurso: string;
  /** Número de expediente (ej. "007125-2023"). */
  expediente: string;
  /** Pretensión / Delito. */
  pretensionDelito: string;
  /** Tipo de resolución (ej. "Ejecutoria Suprema"). */
  tipoResolucion: string;
  /** Fecha de la resolución tal como la publica el portal (dd/mm/yyyy). */
  fechaResolucion: string;
  /** Sala Suprema u órgano jurisdiccional. */
  salaSuprema: string;
  /** Norma de Derecho Interno. */
  normaDerechoInterno: string;
  /** Sumilla de la resolución. */
  sumilla: string;
  /** Palabras clave. */
  palabrasClave: string;
  /** URL absoluta de descarga del PDF (ServletDescarga). */
  pdfUrl: string;
  /** Página de resultados en la que apareció el registro. */
  pagina: number;
}

export interface FailedDownload {
  documentId: string;
  expediente: string;
  pdfUrl: string;
  status: number | null;
  attempts: number;
  error: string;
  failedAt: string;
}

export interface Checkpoint {
  /** Clave que identifica los criterios de búsqueda usados en la ejecución. */
  searchKey: string;
  lastCompletedPage: number;
  totalPages: number | null;
  totalResults: number | null;
  updatedAt: string;
}

export interface ScrapeSummary {
  pagesProcessed: number;
  documentsFound: number;
  uniqueDocuments: number;
  pdfsDownloaded: number;
  pdfsSkipped: number;
  failedDownloads: number;
  durationMs: number;
}

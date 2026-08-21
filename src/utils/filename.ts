const INVALID_CHARS = /[/\\:*?"<>|]/g;
const CONTROL_CHARS = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + ']', 'g');
const MAX_BASENAME_LENGTH = 150;

/**
 * Convierte un texto arbitrario en un nombre de archivo seguro para
 * Windows/Linux: reemplaza caracteres inválidos, colapsa espacios y
 * limita la longitud sin perder la extensión.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(INVALID_CHARS, '_')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '');
  return cleaned.length > MAX_BASENAME_LENGTH ? cleaned.slice(0, MAX_BASENAME_LENGTH).trim() : cleaned;
}

/** Nombre de PDF: EXPEDIENTE_RESOLUCION_FECHA.pdf (fecha dd/mm/yyyy → yyyy-mm-dd). */
export function buildPdfFilename(expediente: string, tipoResolucion: string, fecha: string): string {
  const isoDate = fecha.split('/').reverse().join('-');
  const parts = [expediente, tipoResolucion, isoDate].filter((p) => p.length > 0);
  return `${sanitizeFilename(parts.join('_').replace(/\s+/g, '-'))}.pdf`;
}

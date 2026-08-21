/**
 * Limpia texto extraído del HTML: colapsa espacios y saltos duplicados
 * conservando el contenido original (no altera tildes ni términos jurídicos).
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .replace(new RegExp(String.fromCharCode(160), 'g'), ' ') // &nbsp;
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

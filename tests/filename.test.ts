import { describe, expect, it } from 'vitest';
import { buildPdfFilename, sanitizeFilename } from '../src/utils/filename';

describe('sanitizeFilename', () => {
  it('reemplaza caracteres inválidos de Windows', () => {
    expect(sanitizeFilename('ABC/123')).toBe('ABC_123');
    expect(sanitizeFilename('ABC:123')).toBe('ABC_123');
    expect(sanitizeFilename('ABC?123')).toBe('ABC_123');
    expect(sanitizeFilename('a\\b*c"d<e>f|g')).toBe('a_b_c_d_e_f_g');
  });

  it('colapsa espacios y recorta extremos', () => {
    expect(sanitizeFilename('  hola   mundo  ')).toBe('hola mundo');
  });

  it('limita nombres demasiado largos', () => {
    const longName = 'x'.repeat(500);
    expect(sanitizeFilename(longName).length).toBeLessThanOrEqual(150);
  });

  it('conserva tildes y ñ', () => {
    expect(sanitizeFilename('Casación Ñaña')).toBe('Casación Ñaña');
  });
});

describe('buildPdfFilename', () => {
  it('construye EXPEDIENTE_RESOLUCION_FECHA.pdf con fecha ISO', () => {
    expect(buildPdfFilename('007125-2023', 'Ejecutoria Suprema', '28/12/2024')).toBe(
      '007125-2023_Ejecutoria-Suprema_2024-12-28.pdf',
    );
  });

  it('omite partes vacías', () => {
    expect(buildPdfFilename('007125-2023', '', '')).toBe('007125-2023.pdf');
  });
});

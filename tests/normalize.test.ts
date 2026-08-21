import { describe, expect, it } from 'vitest';
import { normalizeText } from '../src/utils/normalize';

describe('normalizeText', () => {
  it('colapsa espacios duplicados y recorta', () => {
    expect(normalizeText('   texto    prueba   ')).toBe('texto prueba');
  });

  it('normaliza saltos de línea', () => {
    expect(normalizeText('a\r\nb\r\n\r\nc')).toBe('a\nb\nc');
  });

  it('maneja null y undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('conserva caracteres del español', () => {
    expect(normalizeText('  Sala Penal — Casación  á é í ó ú ñ ° ')).toBe('Sala Penal — Casación á é í ó ú ñ °');
  });
});

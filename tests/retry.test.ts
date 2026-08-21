import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { computeBackoffMs, isRetryableError, parseRetryAfterMs, withRetries } from '../src/http/retry';

function axiosErrorWithStatus(status: number): AxiosError {
  const error = new AxiosError(`HTTP ${status}`);
  error.response = {
    status,
    statusText: '',
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: null,
  };
  return error;
}

function axiosErrorWithCode(code: string): AxiosError {
  const error = new AxiosError('network', code);
  return error;
}

describe('isRetryableError', () => {
  it('429 y 5xx son retriables', () => {
    expect(isRetryableError(axiosErrorWithStatus(429))).toBe(true);
    expect(isRetryableError(axiosErrorWithStatus(503))).toBe(true);
    expect(isRetryableError(axiosErrorWithStatus(500))).toBe(true);
  });

  it('404 y 403 no son retriables', () => {
    expect(isRetryableError(axiosErrorWithStatus(404))).toBe(false);
    expect(isRetryableError(axiosErrorWithStatus(403))).toBe(false);
  });

  it('errores de red conocidos son retriables', () => {
    expect(isRetryableError(axiosErrorWithCode('ECONNRESET'))).toBe(true);
    expect(isRetryableError(axiosErrorWithCode('ETIMEDOUT'))).toBe(true);
    expect(isRetryableError(axiosErrorWithCode('ECONNABORTED'))).toBe(true);
  });

  it('errores genéricos no-Axios no son retriables', () => {
    expect(isRetryableError(new Error('bug de programación'))).toBe(false);
  });
});

describe('computeBackoffMs', () => {
  it('crece exponencialmente con jitter acotado', () => {
    const noJitter = (): number => 0;
    expect(computeBackoffMs(0, 1000, 60000, noJitter)).toBe(1000);
    expect(computeBackoffMs(1, 1000, 60000, noJitter)).toBe(2000);
    expect(computeBackoffMs(2, 1000, 60000, noJitter)).toBe(4000);
    expect(computeBackoffMs(3, 1000, 60000, noJitter)).toBe(8000);
    expect(computeBackoffMs(4, 1000, 60000, noJitter)).toBe(16000);
  });

  it('aplica jitter proporcional a la base', () => {
    const fullJitter = (): number => 1;
    expect(computeBackoffMs(0, 1000, 60000, fullJitter)).toBe(2000);
  });

  it('respeta el máximo configurado', () => {
    expect(computeBackoffMs(20, 1000, 60000, () => 0)).toBe(60000);
  });
});

describe('withRetries', () => {
  const fastOptions = { maxRetries: 3, backoffBaseMs: 1, backoffMaxMs: 5 };

  it('reintenta errores retriables hasta tener éxito', async () => {
    let calls = 0;
    const result = await withRetries(async () => {
      calls += 1;
      if (calls < 3) throw axiosErrorWithStatus(500);
      return 'ok';
    }, fastOptions);
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('no reintenta errores no retriables', async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw axiosErrorWithStatus(404);
      }, fastOptions),
    ).rejects.toThrow('HTTP 404');
    expect(calls).toBe(1);
  });

  it('agota los reintentos y propaga el último error', async () => {
    let calls = 0;
    await expect(
      withRetries(async () => {
        calls += 1;
        throw axiosErrorWithStatus(503);
      }, fastOptions),
    ).rejects.toThrow('HTTP 503');
    expect(calls).toBe(4);
  });
});

describe('parseRetryAfterMs', () => {
  it('interpreta segundos', () => {
    expect(parseRetryAfterMs('7')).toBe(7000);
  });

  it('interpreta fecha HTTP', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    expect(parseRetryAfterMs('Thu, 01 Jan 2026 00:00:30 GMT', now)).toBe(30000);
  });

  it('devuelve null para valores inválidos o ausentes', () => {
    expect(parseRetryAfterMs(undefined)).toBeNull();
    expect(parseRetryAfterMs('no-es-fecha')).toBeNull();
  });
});

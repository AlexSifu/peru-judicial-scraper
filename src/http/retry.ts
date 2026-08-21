import { AxiosError } from 'axios';

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EPIPE', 'EAI_AGAIN']);

export interface RetryOptions {
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export function getStatus(error: unknown): number | null {
  if (error instanceof AxiosError && error.response) {
    return error.response.status;
  }
  return null;
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof AxiosError) {
    if (error.response) {
      return RETRYABLE_STATUS.has(error.response.status);
    }
    if (error.code) {
      return RETRYABLE_CODES.has(error.code);
    }
    // Error de red sin respuesta ni código concreto: vale la pena reintentar.
    return true;
  }
  return false;
}

/**
 * Delay del intento `attempt` (base 0): baseDelay × 2^attempt + jitter,
 * acotado por backoffMaxMs. `random` es inyectable para pruebas deterministas.
 */
export function computeBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const exponential = baseMs * 2 ** attempt;
  const jitter = random() * baseMs;
  return Math.min(exponential + jitter, maxMs);
}

/**
 * Interpreta el header Retry-After (segundos o fecha HTTP) y devuelve
 * milisegundos de espera, o null si no es interpretable.
 */
export function parseRetryAfterMs(headerValue: string | undefined, now: Date = new Date()): number | null {
  if (!headerValue) return null;
  const asSeconds = Number(headerValue);
  if (!Number.isNaN(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }
  const asDate = new Date(headerValue);
  if (!Number.isNaN(asDate.getTime())) {
    return Math.max(0, asDate.getTime() - now.getTime());
  }
  return null;
}

export function getRetryAfterMs(error: unknown): number | null {
  if (error instanceof AxiosError && error.response) {
    const header = error.response.headers['retry-after'];
    return parseRetryAfterMs(typeof header === 'string' ? header : undefined);
  }
  return null;
}

/**
 * Ejecuta `operation` reintentando ante errores retriables (429/5xx/red) con
 * backoff exponencial y respeto de Retry-After. `onRetry` permite loguear
 * cada reintento sin acoplar este módulo al logger.
 */
export async function withRetries<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  onRetry?: (attempt: number, waitMs: number, error: unknown) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= options.maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === options.maxRetries) {
        throw error;
      }
      const retryAfterMs = getRetryAfterMs(error);
      const waitMs = retryAfterMs ?? computeBackoffMs(attempt, options.backoffBaseMs, options.backoffMaxMs);
      onRetry?.(attempt + 1, waitMs, error);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }
  throw lastError;
}

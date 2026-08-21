import axios, { AxiosInstance } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';

export interface HttpSession {
  client: AxiosInstance;
  jar: CookieJar;
}

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-PE,es;q=0.9',
};

/**
 * Crea la sesión HTTP única del scraper: Axios + cookie jar compartido.
 * El portal redirige a URLs http://; se reescriben a https para no perder
 * la sesión (el sitio solo sirve contenido por TLS).
 */
export function createHttpSession(timeoutMs: number): HttpSession {
  const jar = new CookieJar();
  const client = wrapper(
    axios.create({
      jar,
      timeout: timeoutMs,
      headers: DEFAULT_HEADERS,
      maxRedirects: 0,
      validateStatus: (status) => status >= 200 && status < 400,
    }),
  );
  return { client, jar };
}

/** Sigue manualmente redirecciones 3xx forzando https, conservando la sesión. */
export async function followRedirects(
  session: HttpSession,
  initialUrl: string,
  maxHops = 5,
): Promise<{ finalUrl: string; html: string }> {
  let url = initialUrl;
  for (let hop = 0; hop < maxHops; hop += 1) {
    const response = await session.client.get<string>(url, { responseType: 'text' });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers['location'];
      if (!location) {
        throw new Error(`Redirección ${response.status} sin header Location desde ${url}`);
      }
      url = new URL(location.replace(/^http:/, 'https:'), url).toString();
      continue;
    }
    return { finalUrl: url, html: response.data };
  }
  throw new Error(`Demasiadas redirecciones partiendo de ${initialUrl}`);
}

import { AppConfig } from '../config/config';
import { followRedirects } from '../http/client';
import { logger } from '../utils/logger';
import {
  findGeneralSearchButton,
  isMissingCriteriaPage,
  parseResultsInfo,
  ResultsPageInfo,
  serializeForm,
} from './parser';
import { ScraperSession } from './session';

export interface SearchResult {
  html: string;
  info: ResultsPageInfo;
}

/** Clave estable que identifica los criterios usados (para checkpoint). */
export function buildSearchKey(config: AppConfig): string {
  return `year=${config.searchYear};text=${config.searchText}`;
}

/**
 * Envía la búsqueda general desde inicio.xhtml reproduciendo el POST del
 * navegador (mojarra.jsfcljs): campos serializados del formulario, criterios
 * configurados y los parámetros reales del botón de búsqueda. El servidor
 * responde 302 hacia resultado.xhtml.
 */
export async function submitSearch(session: ScraperSession, config: AppConfig, inicioHtml: string): Promise<SearchResult> {
  const fields = serializeForm(inicioHtml, 'formBuscador');
  const button = findGeneralSearchButton(inicioHtml);

  fields['formBuscador:buAnio'] = config.searchYear;
  fields['formBuscador:txtBusqueda'] = config.searchText;
  fields['formBuscador:tabpanel-value'] = 'general';
  Object.assign(fields, button.params);

  const body = new URLSearchParams(fields).toString();
  const response = await session.http.client.post(session.url('/faces/page/inicio.xhtml'), body, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: session.url('/faces/page/inicio.xhtml'),
    },
  });

  let resultsHtml: string;
  if (response.status >= 300 && response.status < 400) {
    const location: string = response.headers['location'] ?? session.url('/faces/page/resultado.xhtml');
    const target = new URL(location.replace(/^http:/, 'https:'), config.baseUrl).toString();
    const { html } = await followRedirects(session.http, target);
    resultsHtml = html;
  } else {
    resultsHtml = response.data as string;
  }

  if (isMissingCriteriaPage(resultsHtml)) {
    throw new Error(
      'El portal rechazó la búsqueda: se requiere al menos un criterio (configure SEARCH_YEAR o SEARCH_TEXT)',
    );
  }

  const info = parseResultsInfo(resultsHtml);
  if (info.totalResults === null) {
    throw new Error('No se pudo leer el total de resultados; la respuesta no parece una página de resultados');
  }
  logger.info(`Search submitted successfully - ${info.totalResults} results, ${info.totalPages ?? '?'} pages`);
  return { html: resultsHtml, info };
}

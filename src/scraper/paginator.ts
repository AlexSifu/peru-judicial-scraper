import { JudicialDocument } from '../models/document';
import { logger } from '../utils/logger';
import { parsePartialResponse, parseRecords } from './parser';
import { ScraperSession } from './session';

export class ViewExpiredError extends Error {
  constructor() {
    super('El servidor reportó la vista JSF como expirada');
  }
}

/**
 * Solicita una página de resultados vía AJAX parcial de JSF, reproduciendo
 * la petición del RichFaces DataScroller. El fragmento actualizado
 * formBuscador:panel contiene los registros y llega un ViewState nuevo.
 */
export async function fetchResultsPage(
  session: ScraperSession,
  dataScrollerId: string,
  page: number,
): Promise<JudicialDocument[]> {
  const formId = dataScrollerId.split(':')[0];
  const params = new URLSearchParams({
    [formId]: formId,
    'javax.faces.ViewState': session.viewState,
    'javax.faces.source': dataScrollerId,
    'javax.faces.partial.ajax': 'true',
    'javax.faces.partial.execute': '@component',
    'javax.faces.partial.render': '@component',
    'org.richfaces.ajax.component': dataScrollerId,
    [`${dataScrollerId}:page`]: String(page),
    incId: '1',
    [dataScrollerId]: dataScrollerId,
  });

  const response = await session.http.client.post<string>(
    session.url('/faces/page/resultado.xhtml'),
    params.toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'Faces-Request': 'partial/ajax',
        Referer: session.url('/faces/page/resultado.xhtml'),
      },
      responseType: 'text',
    },
  );

  const partial = parsePartialResponse(response.data);
  if (partial.isError) {
    if ((partial.errorName ?? '').includes('ViewExpiredException')) {
      throw new ViewExpiredError();
    }
    throw new Error(`El servidor devolvió un error JSF: ${partial.errorName}`);
  }
  session.updateViewState(partial.viewState);

  const panelHtml = [...partial.updates.entries()]
    .filter(([id]) => id.endsWith(':panel'))
    .map(([, html]) => html)
    .join('\n');
  if (!panelHtml) {
    logger.warn(`Page ${page}: la respuesta AJAX no actualizó el panel de resultados`);
    return [];
  }
  return parseRecords(panelHtml, page);
}

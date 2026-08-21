import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import { JudicialDocument } from '../models/document';
import { normalizeText } from '../utils/normalize';

export interface SearchButton {
  /** Parámetros que el botón agrega al POST (incluye su propio name). */
  params: Record<string, string>;
}

export interface ResultsPageInfo {
  totalResults: number | null;
  totalPages: number | null;
  currentPage: number | null;
  dataScrollerId: string | null;
}

export function extractViewState(html: string): string | null {
  const $ = cheerio.load(html);
  const value = $('input[name="javax.faces.ViewState"]').first().attr('value');
  return value ?? null;
}

/**
 * Serializa el formulario JSF como lo haría un navegador: inputs de texto
 * e hidden, selects con su opción seleccionada y checkboxes marcados.
 */
export function serializeForm(html: string, formId: string): Record<string, string> {
  const $ = cheerio.load(html);
  const form = $(`form#${formId.replace(/:/g, '\\:')}`);
  if (form.length === 0) {
    throw new Error(`Formulario ${formId} no encontrado en la página`);
  }
  const fields: Record<string, string> = {};
  form.find('input, select, textarea').each((_, el) => {
    const node = $(el);
    const name = node.attr('name');
    if (!name) return;
    const tag = el.tagName.toLowerCase();
    if (tag === 'select') {
      const selected = node.find('option[selected]').first();
      const option = selected.length > 0 ? selected : node.find('option').first();
      fields[name] = option.attr('value') ?? '';
      return;
    }
    const type = (node.attr('type') ?? 'text').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      if (node.attr('checked') !== undefined) {
        fields[name] = node.attr('value') ?? 'on';
      }
      return;
    }
    if (type === 'submit' || type === 'image' || type === 'button') {
      return;
    }
    fields[name] = node.attr('value') ?? '';
  });
  return fields;
}

/**
 * Localiza en inicio.xhtml el botón de búsqueda general y extrae los
 * parámetros reales que envía mojarra.jsfcljs. Se identifica por incluir
 * forward=buscar y no pertenecer a la búsqueda especializada.
 */
export function findGeneralSearchButton(html: string): SearchButton {
  const $ = cheerio.load(html);
  let found: SearchButton | null = null;
  $('input[type="image"][onclick]').each((_, el) => {
    if (found) return;
    const onclick = ($(el).attr('onclick') ?? '').replace(/\\'/g, "'");
    const match = /mojarra\.jsfcljs\(document\.getElementById\('formBuscador'\),\{(.+?)\},''\)/.exec(onclick);
    if (!match) return;
    const params: Record<string, string> = {};
    for (const entry of match[1].matchAll(/'([^']*)':'([^']*)'/g)) {
      params[entry[1]] = entry[2];
    }
    if (params['forward'] === 'buscar' && params['busqueda'] === undefined) {
      found = { params };
    }
  });
  if (!found) {
    throw new Error('No se encontró el botón de búsqueda general en inicio.xhtml');
  }
  return found;
}

function fieldValue($: cheerio.CheerioAPI, record: cheerio.Cheerio<AnyNode>, label: string): string {
  let value = '';
  record.find('div.txtbold').each((_, el) => {
    const node = $(el);
    if (normalizeText(node.text()).replace(/:$/, '') === label) {
      const sibling = node.next('div');
      if (sibling.length > 0) {
        value = normalizeText(sibling.text());
      }
    }
  });
  return value;
}

/**
 * Extrae los registros de resultados (bloques formBuscador:repeat:N) de un
 * HTML de resultado.xhtml o de un fragmento actualizado por AJAX.
 */
export function parseRecords(html: string, pagina: number): JudicialDocument[] {
  const $ = cheerio.load(html);
  const documents: JudicialDocument[] = [];
  $('div[id^="formBuscador:repeat:"]').each((_, el) => {
    const record = $(el);
    const id = record.attr('id') ?? '';
    // Solo los paneles raíz de cada registro (evita divs internos _header/_body).
    if (!/^formBuscador:repeat:\d+:[^:]+$/.test(id) || !record.hasClass('rf-p')) return;

    const pdfHref = record.find('a[href*="ServletDescarga"]').first().attr('href');
    if (!pdfHref) return;
    const uuidMatch = /uuid=([0-9a-fA-F-]+)/.exec(pdfHref);
    if (!uuidMatch) return;

    const headerSpans = record.find('div[id$="_header"] span');
    const recurso = normalizeText(headerSpans.eq(0).text());
    const expediente = normalizeText(headerSpans.eq(1).text());

    documents.push({
      uuid: uuidMatch[1].toLowerCase(),
      recurso,
      expediente,
      pretensionDelito: fieldValue($, record, 'Pretensión/Delito'),
      tipoResolucion: fieldValue($, record, 'Tipo Resolución'),
      fechaResolucion: fieldValue($, record, 'Fecha Resolución'),
      salaSuprema: fieldValue($, record, 'Sala Suprema'),
      normaDerechoInterno: fieldValue($, record, 'Norma de Derecho Interno'),
      sumilla: fieldValue($, record, 'Sumilla'),
      palabrasClave: fieldValue($, record, 'Palabras Clave'),
      pdfUrl: pdfHref,
      pagina,
    });
  });
  return documents;
}

/** Lee totales y estado del paginador de la página completa de resultados. */
export function parseResultsInfo(html: string): ResultsPageInfo {
  const totalMatch = /De un total de\s+(\d+)\s+resoluciones,\s+se obtuvieron\s+(\d+)\s+resultados/.exec(html);
  const spinnerMatch = /InputNumberSpinner\('formBuscador:spinner',\s*\{[^}]*maxValue:\s*(\d+)/.exec(html);
  const currentPageMatch = /"currentPage":(\d+)/.exec(html);
  const scrollerMatch = /new RichFaces\.ui\.DataScroller\("([^"]+)"/.exec(html);
  return {
    totalResults: totalMatch ? Number(totalMatch[2]) : null,
    totalPages: spinnerMatch ? Number(spinnerMatch[1]) : null,
    currentPage: currentPageMatch ? Number(currentPageMatch[1]) : null,
    dataScrollerId: scrollerMatch ? scrollerMatch[1] : null,
  };
}

export interface PartialResponse {
  updates: Map<string, string>;
  viewState: string | null;
  isError: boolean;
  errorName: string | null;
}

/** Procesa el XML <partial-response> de JSF y extrae updates y ViewState. */
export function parsePartialResponse(xml: string): PartialResponse {
  const $ = cheerio.load(xml, { xmlMode: true });
  const updates = new Map<string, string>();
  let viewState: string | null = null;
  $('partial-response update').each((_, el) => {
    const id = $(el).attr('id') ?? '';
    const content = $(el).text();
    if (id === 'javax.faces.ViewState') {
      viewState = content.trim();
    } else {
      updates.set(id, content);
    }
  });
  const errorName = $('partial-response error error-name').text().trim() || null;
  return {
    updates,
    viewState,
    isError: errorName !== null,
    errorName,
  };
}

/** Detecta la página de inicio con el mensaje de validación de criterios. */
export function isMissingCriteriaPage(html: string): boolean {
  return html.includes('por lo menos un criterio');
}

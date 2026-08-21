import * as fs from 'fs';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  extractViewState,
  parsePartialResponse,
  parseRecords,
  parseResultsInfo,
} from '../src/scraper/parser';

const resultsHtml = fs.readFileSync(path.join(__dirname, 'fixtures', 'results-page.html'), 'utf-8');
const partialXml = fs.readFileSync(path.join(__dirname, 'fixtures', 'partial-response.xml'), 'utf-8');

describe('extractViewState', () => {
  it('extrae el ViewState del formulario', () => {
    expect(extractViewState(resultsHtml)).toBe('1111111111111111111:2222222222222222222');
  });
});

describe('parseResultsInfo', () => {
  it('lee totales, páginas y el id del DataScroller', () => {
    const info = parseResultsInfo(resultsHtml);
    expect(info.totalResults).toBe(17667);
    expect(info.totalPages).toBe(1767);
    expect(info.dataScrollerId).toBe('formBuscador:data1');
  });
});

describe('parseRecords', () => {
  it('extrae los registros con sus campos reales', () => {
    const records = parseRecords(resultsHtml, 1);
    expect(records).toHaveLength(2);
    const first = records[0];
    expect(first.uuid).toBe('9dc0ebac-76b0-4207-906a-dd3b441483ad');
    expect(first.recurso).toBe('Apelación');
    expect(first.expediente).toBe('007125-2023');
    expect(first.pretensionDelito).toBe('Revisión de Procedimiento Coactivo');
    expect(first.tipoResolucion).toBe('Ejecutoria Suprema');
    expect(first.fechaResolucion).toBe('28/12/2024');
    expect(first.salaSuprema).toBe('Quinta Sala de Derecho Constitucional y Social Transitoria');
    expect(first.pdfUrl).toContain('ServletDescarga?uuid=9dc0ebac-76b0-4207-906a-dd3b441483ad');
    expect(first.pagina).toBe(1);
  });
});

describe('parsePartialResponse', () => {
  it('extrae updates, registros y el nuevo ViewState', () => {
    const partial = parsePartialResponse(partialXml);
    expect(partial.isError).toBe(false);
    expect(partial.viewState).toBe('3333333333333333333:4444444444444444444');
    const panel = partial.updates.get('formBuscador:panel');
    expect(panel).toBeDefined();
    const records = parseRecords(panel as string, 2);
    expect(records).toHaveLength(2);
    expect(records[0].uuid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('detecta errores JSF como ViewExpiredException', () => {
    const errorXml =
      "<?xml version='1.0' encoding='UTF-8'?><partial-response><error><error-name>class javax.faces.application.ViewExpiredException</error-name><error-message><![CDATA[view expired]]></error-message></error></partial-response>";
    const partial = parsePartialResponse(errorXml);
    expect(partial.isError).toBe(true);
    expect(partial.errorName).toContain('ViewExpiredException');
  });
});

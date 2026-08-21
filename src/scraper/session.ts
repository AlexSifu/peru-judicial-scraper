import { AppConfig } from '../config/config';
import { createHttpSession, followRedirects, HttpSession } from '../http/client';
import { logger } from '../utils/logger';
import { extractViewState } from './parser';

/**
 * Sesión de scraping: mantiene el cookie jar (JSESSIONID) y el ViewState
 * vigente. JSF emite un ViewState nuevo tras cada interacción AJAX, por lo
 * que siempre debe usarse el último recibido.
 */
export class ScraperSession {
  readonly http: HttpSession;

  private currentViewState: string | null = null;

  constructor(private readonly config: AppConfig) {
    this.http = createHttpSession(config.requestTimeoutMs);
  }

  get viewState(): string {
    if (!this.currentViewState) {
      throw new Error('La sesión no tiene ViewState; debe inicializarse primero');
    }
    return this.currentViewState;
  }

  updateViewState(viewState: string | null): void {
    if (viewState) {
      this.currentViewState = viewState;
    }
  }

  url(pathname: string): string {
    return `${this.config.baseUrl}${pathname}`;
  }

  /** GET inicial a inicio.xhtml: establece cookies y captura el primer ViewState. */
  async initialize(): Promise<string> {
    const { html } = await followRedirects(this.http, this.url('/faces/page/inicio.xhtml'));
    const viewState = extractViewState(html);
    if (!viewState) {
      throw new Error('No se encontró javax.faces.ViewState en inicio.xhtml');
    }
    this.currentViewState = viewState;
    logger.info('Session initialized');
    return html;
  }
}

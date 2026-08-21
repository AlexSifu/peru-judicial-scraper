# Scraper Challenge

## Descripción

Scraper profesional en TypeScript/Node.js para el portal de jurisprudencia del Poder Judicial del Perú (`https://jurisprudencia.pj.gob.pe/jurisprudenciaweb`). Realiza una búsqueda de resoluciones, recorre todas las páginas de resultados, extrae los metadatos de cada resolución (recurso, expediente, pretensión/delito, tipo de resolución, fecha, sala suprema, norma, sumilla, palabras clave) y descarga los PDFs asociados.

El scraper trabaja **exclusivamente con peticiones HTTP** (sin navegador ni automatización de navegador). El portal está construido sobre JSF 2 (Mojarra) + RichFaces 4, por lo que el scraper reproduce el flujo real del navegador:

- **Sesión**: `GET /faces/page/inicio.xhtml` establece la cookie `JSESSIONID` y entrega el primer `javax.faces.ViewState`.
- **Búsqueda**: `POST` tradicional del formulario `formBuscador` (equivalente a `mojarra.jsfcljs`) con los criterios configurados; el servidor responde `302` hacia `resultado.xhtml`.
- **Paginación**: peticiones AJAX parciales (`Faces-Request: partial/ajax`) contra el DataScroller de RichFaces; cada respuesta `<partial-response>` incluye el HTML actualizado del panel de resultados y un nuevo `ViewState` que se debe reutilizar.
- **Descarga de PDF**: `GET /jurisprudenciaweb/ServletDescarga?uuid=<uuid>`; el enlace se detecta dinámicamente en cada registro (no se construye a mano).

## Tecnologías

- Node.js + TypeScript (modo `strict`)
- [Axios](https://axios-http.com/) — cliente HTTP
- [Cheerio](https://cheerio.js.org/) — parsing de HTML/XML
- [tough-cookie](https://github.com/salesforce/tough-cookie) + [axios-cookiejar-support](https://github.com/3846masa/axios-cookiejar-support) — manejo de cookies de sesión
- [dotenv](https://github.com/motdotla/dotenv) — configuración por variables de entorno
- [Vitest](https://vitest.dev/) — pruebas unitarias

## Requisitos

```text
Node.js >= 20
npm
Conectividad desde Perú para el portal principal
```

## Instalación

```bash
git clone <url-del-repositorio>
cd scraper-challenge
npm install
cp .env.example .env    # Windows (PowerShell): Copy-Item .env.example .env
```

Todas las variables de `.env` tienen valores por defecto razonables; el scraper funciona sin editar nada.

## Ejecución en desarrollo

```bash
npm run dev
```

## Ejecución limitada

Para procesar pocas páginas/documentos (recomendado para pruebas):

```bash
npm run dev -- --max-pages=1 --max-documents=3
npm run dev -- --max-pages=2 --download-pdfs=false
```

Flags disponibles (también configurables por `.env`):

| Flag | Descripción |
|------|-------------|
| `--max-pages=N` | Máximo de páginas de resultados a procesar |
| `--max-documents=N` | Máximo de documentos a procesar |
| `--download-pdfs=true\|false` | Descargar o no los PDFs |
| `--search-year=YYYY` | Año de resolución (criterio de búsqueda; por defecto 2024) |
| `--search-text=...` | Texto libre de búsqueda |

> El portal exige al menos un criterio de búsqueda; por defecto se usa el año configurado en `SEARCH_YEAR`.

## Build

```bash
npm run build
```

## Producción

```bash
npm start
```

## Reintentar descargas fallidas

Las descargas que agotan sus reintentos quedan registradas en `data/failed-downloads.json`. Para reintentarlas:

```bash
npm run retry-failed
```

Las descargas recuperadas se eliminan del registro; las que siguen fallando permanecen para un intento posterior.

## Pruebas

```bash
npm test
```

## Estructura del proyecto

```text
src/
├── config/       # Carga de configuración (.env + flags CLI)
├── http/         # Cliente HTTP con cookie jar, redirects y estrategia de reintentos
├── scraper/      # Sesión JSF, búsqueda, parser de resultados y paginación AJAX
├── downloader/   # Descarga de PDFs con streaming y validación %PDF-
├── storage/      # Persistencia: documents.json/csv, fallos y checkpoint
├── models/       # Interfaces de dominio
├── utils/        # Logger, delays, normalización, nombres de archivo
├── index.ts      # Punto de entrada
└── retry-failed.ts
tests/            # Pruebas unitarias + fixtures HTML/XML reales
```

## Datos generados

```text
data/documents.json         # Todos los documentos únicos extraídos (UTF-8)
data/documents.csv          # Mismo contenido en CSV (UTF-8 con BOM, compatible con Excel)
data/pdfs/                  # PDFs descargados: EXPEDIENTE_TIPO_FECHA_<uuid8>.pdf
data/failed-downloads.json  # Descargas fallidas tras agotar reintentos
data/checkpoint.json        # Última página completada (permite reanudar)
```

- **Deduplicación**: los documentos se identifican por el UUID que el portal asigna a cada resolución; volver a procesar una página no genera duplicados.
- **Checkpoint/reanudación**: si el proceso se interrumpe (incluido `Ctrl+C`), la siguiente ejecución con los mismos criterios continúa desde la última página completada.
- En `data/examples/` se incluye una pequeña muestra real del formato de salida.

## Manejo de rate limiting

- **HTTP 429**: tratado como error retriable en todas las peticiones (navegación, paginación y descargas).
- **Retry-After**: si el servidor envía este header (en segundos o fecha HTTP), su valor tiene prioridad sobre el backoff calculado.
- **Exponential backoff**: `delay = baseDelay × 2^intento`, acotado por `BACKOFF_MAX_MS`.
- **Jitter**: se suma un componente aleatorio proporcional a la base para evitar sincronización de reintentos.
- **Máximo de reintentos**: `MAX_RETRIES` (por defecto 5); al agotarse, la descarga se registra en `failed-downloads.json`.
- Además se aplica un **delay fijo entre peticiones** (`REQUEST_DELAY_MS`, por defecto 1000 ms) para no saturar el portal.

También se reintentan los errores transitorios del propio portal (respuestas `5xx` intermitentes y errores de red como `ECONNRESET`/`ETIMEDOUT`), y las expiraciones de vista JSF (`ViewExpiredException`) se recuperan reconstruyendo la sesión y reposicionándose en la página correspondiente.

## Consideración geográfica

> El portal principal del Poder Judicial del Perú puede restringir conexiones originadas fuera del territorio peruano. La ejecución y validación final del scraper debe realizarse desde una conexión con acceso al portal desde Perú.

## Notas de implementación

- Los logs no incluyen cookies, tokens ni el contenido del `ViewState`.
- Los PDFs se descargan por streaming a un archivo temporal `.tmp`, se validan por el encabezado `%PDF-` y solo entonces se renombran a su nombre final.
- `SIGINT`/`SIGTERM` detienen el proceso de forma ordenada persistiendo el estado actual.

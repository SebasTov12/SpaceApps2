# SAROS

**Seeing change on Earth. Understanding who may be affected. Acting earlier.**

SAROS is a geospatial decision-support prototype that brings satellite radar observations, territorial information and socioeconomic context into one accessible experience. It is designed to help people see where the ground or landscape is changing, understand which communities and livelihoods may be exposed, and decide where further investigation and prevention should begin.

> **SAROS is an exploratory planning and communication tool. It is not an official warning system, a substitute for local authorities, or a guarantee of safety.**

## SAROS desplegado: resumen y evaluación en cinco criterios

**Plataforma:** [saros.tobaru.xyz](https://saros.tobaru.xyz)

**Estado:** aplicación publicada con frontend Next.js, API Flask, PostgreSQL y predictor SAROS en contenedores Docker. GitHub Actions construye y publica las imágenes; Orivia las actualiza desde `main` mediante un servicio programado. Caddy sirve el dominio con HTTPS.

SAROS combina exploración geográfica, registros históricos de amenazas, contexto territorial y análisis de radar. El objetivo es ayudar a entender dónde hay información que merece revisión, qué se sabe de esa ubicación y qué datos faltan. Las pantallas, capas y resultados mantienen su procedencia y límites: que algo aparezca en el mapa no significa que sea una alerta ni que todos los datos sean observaciones satelitales reales.

### 1. IMPACTO

Los movimientos del terreno, inundaciones, incendios, cambios en glaciares y transformaciones del paisaje pueden afectar viviendas, vías, agricultura, servicios y medios de vida. SAROS acerca señales geoespaciales y registros públicos a una interfaz que permite explorar ubicaciones, fechas, fuentes e impactos reportados.

La utilidad esperada es orientar preguntas, priorizar verificaciones en campo y apoyar conversaciones de prevención entre comunidades, analistas y autoridades. No afirmamos que SAROS ya haya reducido pérdidas, detectado una emergencia en curso o cambiado decisiones oficiales: esos resultados requieren evaluación con usuarios y autoridades locales.

### 2. CREATIVIDAD

- Globo 3D interactivo con navegación por países y zonas, más capas de mapa para examinar ubicaciones.
- Explorador con fechas, comparación antes/después, capas de cambio y series temporales cuando hay datos disponibles.
- Fichas para puntos de amenazas históricas y evaluaciones del modelo. Muestran ubicación y precisión geográfica, fuente, fechas, impactos que constan en el registro y resultado SAROS cuando existe uno guardado.
- Capas territoriales y socioeconómicas para relacionar el fenómeno con población, viviendas, actividades y servicios; su disponibilidad y carácter DEMO o real se indican en la interfaz.
- Saru, guía conversacional en español e inglés, conectada a Groq y al contexto guardado en SAROS. Responde brevemente, explica límites y no sustituye a una autoridad.

La propuesta creativa es unir la exploración de la Tierra, la explicación del radar y el contexto humano en una sola experiencia. El globo y sus animaciones son visualización; no son una simulación física ni mediciones en vivo.

### 3. VALIDEZ Y TRANSPARENCIA DE LOS DATOS

| Componente | Estado de los datos | Qué significa |
| --- | --- | --- |
| Capas y series preempaquetadas del explorador | **Sintéticas / DEMO** | Se generaron para demostrar la experiencia y tienen estructura parecida a productos NISAR. No son mediciones de las escenas ni evidencia de movimiento, inundación o pérdida forestal. La interfaz las identifica como demo. |
| Catálogo ASF/NASA de escenas NISAR | **Metadatos reales** | El catálogo permite consultar productos, fechas y madurez. Que una escena exista en ASF no significa que SAROS la haya descargado, procesado o validado para el mapa. |
| Registros de amenazas UNGRD, SGC y otras fuentes públicas | **Registros históricos reales, según procedencia** | Los puntos y sus fechas representan lo reportado en las fuentes incorporadas a la base. Algunos lugares usan un centroide municipal o de geometría si la fuente no tiene coordenadas exactas. No son alertas activas ni necesariamente eventos recientes. |
| Contexto territorial y agrícola | **Datos públicos o DEMO según la capa** | Las rutas permiten consultar información municipal y agrícola cuando está cargada. Los escenarios ilustrativos de exposición no son daños confirmados ni un censo en tiempo real. |
| Evaluación compuesta SAROS | **Modelo entrenado con insumos reales; resultado exploratorio** | Detecta anomalías estadísticas en características de fase y coherencia NISAR y estima consecuencias históricas municipales. No estima probabilidad de desastre, causalidad, vulnerabilidad de cada hogar ni seguridad. |
| Asistente Saru/Groq | **LLM real de proveedor externo; no entrenado por SAROS** | Resume y explica contexto que ya está guardado. No crea ni valida observaciones, imágenes, alertas o pronósticos científicos. |

**¿El modelo de IA es real y está entrenado?** Sí: el artefacto compuesto `nisar-impact-composite-0.2.0` se entrenó el 15 de noviembre de 2026 con código PyTorch y se integra al servicio predictor. Es una combinación de métodos estadísticos, no una red neuronal que predice desastres:

1. **Anomalías NISAR:** detector no supervisado por órbita que combina fase desenrollada GUNW estandarizada de forma robusta y magnitud de coherencia. El informe registra **264.684 píxeles válidos** de dos tracks (`083-D-087` y `047-A-003`), con siete observaciones de entrenamiento y dos observaciones posteriores reservadas por track para una comprobación temporal exploratoria. Se usaron escenas GUNW PROVISIONAL; la fase se normaliza por granule y esta línea base no aplica correcciones atmosféricas ni de fase externa. No hay etiquetas expertas de deslizamientos asociadas a esos píxeles; por tanto, una anomalía no equivale a un evento ni a una predicción validada.
2. **Contexto de impactos históricos:** estimador empírico jerárquico por departamento y municipio, entrenado con **3.315 reportes UNGRD de afectaciones por movimientos en masa de 2019–2022** y evaluado fuera de tiempo con **1.273 reportes de 2025**. Produce estimaciones basadas en consecuencias históricas reportadas; no mide vulnerabilidad individual ni prueba que una anomalía NISAR haya causado esos impactos.
3. **Validez medida:** la evaluación reporta MAE frente a una línea base global para los reportes de 2025. Es una evaluación temporal exploratoria del estimador histórico, no precisión/accuracy de un detector de deslizamientos ni calibración de riesgo. La rama de anomalías solo revisa la tasa de valores atípicos; no demuestra capacidad predictiva.
4. **U-Net supervisado:** el repositorio incluye la arquitectura y el flujo de entrenamiento, pero **no está entrenado ni operativo**: faltan parches NISAR co-registrados con etiquetas de cambio revisadas por expertos y particiones espaciales/temporales sin fuga. El endpoint de predicción de máscara requiere el artefacto `best.onnx`.

### Predicciones: qué calcula y qué no

- `POST /api/v1/analysis` recibe una pareja de características GUNW (fase y coherencia) y devuelve fracción de píxeles anómalos, prioridad relativa, estimación histórica municipal y recomendación de revisión. Si esa evaluación se guarda, el punto correspondiente la puede mostrar en su ficha.
- `POST /api/v1/nisar/forecasts/run` implementa una tendencia LOS robusta comparada con persistencia y backtesting. Solo acepta observaciones LOS reales con procedencia y control de calidad; cada resultado se etiqueta como exploratorio. La disponibilidad de esta ruta no implica que exista una serie apta o un pronóstico para cada punto.
- SAROS **no calcula actualmente un pronóstico validado de movimiento a 30/90 días para cada marcador**. Las proyecciones lineales de demostración no se presentan como salidas del modelo. Si una ubicación no tiene un resultado guardado, la interfaz lo informa.
- No se predicen terremotos. Ninguna prioridad SAROS es alerta oficial, probabilidad de desastre, ruta segura o instrucción de evacuación.

### Asistente de la plataforma

El chat de Saru pasa por `POST /api/assistant` (proxy privado del frontend) y `POST /api/v1/assistant/chat` (Flask). El backend consulta el contexto de PostgreSQL —observaciones y pronósticos NISAR disponibles, reportes históricos y análisis SAROS— y solicita a Groq una explicación en lenguaje natural. La configuración actual usa `openai/gpt-oss-20b`; la clave permanece en el entorno privado del servidor. Las interacciones y el contexto usado se registran para auditoría.

Groq aporta generación de lenguaje, **no entrena el modelo geoespacial ni genera por sí mismo las predicciones**. Saru diferencia registros históricos de mediciones, análisis y pronósticos; debe decir cuando falta evidencia y remitir las emergencias a fuentes oficiales.

### Servicios y rutas de la plataforma

| Servicio | Rutas principales | Estado y función |
| --- | --- | --- |
| Estado y catálogo | `GET /health`, `GET /ready`, `GET /api/v1/manifest`, `GET /api/v1/datasets`, `GET /api/v1/headlines` | Estado de API/dependencias, procedencia de conjuntos y titulares guardados. |
| Explorador NISAR | `GET /api/v1/sites`, `GET /api/v1/sites/{id}/manifest`, `GET /api/v1/sites/{id}/timeseries`, `GET /api/v1/sites/availability`, `GET /api/v1/sites/{id}/availability` | Catálogo, metadatos de capas, serie temporal e inventario ASF; cada sitio conserva su modo real o DEMO. |
| Puntos y territorio | `GET /api/v1/hazards/points`, `GET /api/v1/regions/{id}/assessment`, `GET /api/v1/territorial/municipalities`, `GET /api/v1/territorial/municipalities/{divipola}`, `GET /api/v1/territorial/agriculture` | Puntos agrupados de fuentes históricas, respuesta territorial explícita y datos municipales/agropecuarios cuando están cargados. |
| Procesamiento | `POST /api/v1/analysis`, `POST /api/v1/predictions` | Análisis compuesto disponible con características GUNW; predicción de máscara U-Net requiere el artefacto supervisado `best.onnx`, todavía pendiente de entrenamiento validado. Requieren token. |
| Observaciones y pronóstico | `POST /api/v1/nisar/observations`, `GET /api/v1/nisar/observations/checkpoint`, `POST /api/v1/nisar/forecasts/run` | Ingesta de LOS con procedencia/calidad, checkpoint e intento de pronóstico temporal solo con observaciones reales aprobadas. Requieren token. |
| Asistente | `POST /api/assistant` (frontend), `POST /api/v1/assistant/chat` (API privada) | Proxy same-origin que mantiene el token en servidor; Groq redacta respuestas basadas en contexto de la base. |

Las rutas protegidas usan Bearer token. El contrato completo, campos obligatorios, controles de calidad y limitaciones está en [backend/README.md](backend/README.md).

### 4. RELEVANCIA

SAROS aborda una necesidad concreta: traducir información geoespacial compleja a preguntas territoriales comprensibles. NISAR puede observar cambios de superficie de manera amplia; las fuentes UNGRD/SGC aportan antecedentes y los datos territoriales ayudan a ubicar población y actividades. Esa combinación puede ayudar a equipos de gestión del riesgo, infraestructura, ambiente, investigación y organizaciones comunitarias a decidir qué revisar con mayor detalle.

La plataforma es relevante para Colombia y también presenta zonas de ejemplo internacionales. Su valor operativo dependerá de procesar escenas reales con controles científicos, actualizar las fuentes, validar las estimaciones localmente y trabajar con las instituciones responsables. Hoy es un prototipo de apoyo a exploración y planificación, no un servicio oficial de monitoreo continuo.

### 5. PRESENTACIÓN

La experiencia se presenta en español e inglés, con globo 3D, sitios destacados, buscador, mapas temporales, leyendas, capas DEMO identificadas y fichas de punto. El panel distingue qué se reportó, a quién se reportó afectación, qué historial hay y si existe una salida del modelo. Saru usa explicaciones breves con contexto de la plataforma.

**Sitio público:** [saros.tobaru.xyz](https://saros.tobaru.xyz)

**Servicios desplegados:** frontend, API Flask, PostgreSQL y predictor en Docker; HTTPS por Caddy; imágenes versionadas en GHCR y actualización automática desde `main`.

La presentación no debe esconder incertidumbre: las capas NISAR del explorador son DEMO hasta que se reemplacen por escenas procesadas y validadas; los registros históricos no son alertas actuales; las estimaciones del modelo requieren revisión técnica y territorial.

## Why SAROS matters

Hazards become disasters when they affect people, homes, essential services, infrastructure and ways of earning a living. Satellite products can reveal changes across large areas, but those signals are difficult to interpret and rarely tell decision-makers who could be affected or what they should investigate next.

SAROS connects these pieces in a shared view. It aims to make geospatial evidence easier to explore for risk-management teams, analysts, infrastructure operators, community organizations and the public. The platform is intended to support earlier field inspections, better-informed prevention planning and clearer conversations about local exposure. It does not make emergency decisions on behalf of communities or authorities.

## Purpose and expected impact

The project is built around a practical chain of evidence:

1. **Observe change:** use NASA–ISRO NISAR radar products to examine surface deformation, changes in radar backscatter or ice displacement where the selected product supports that question.
2. **Explain the signal:** show dates, measurements, map layers and time series in plain language so users can understand what the radar does and does not measure.
3. **Add territorial context:** relate observations to population, housing, roads, public services, agriculture and other local assets when suitable, sourced data are available.
4. **Support prevention:** help users identify places that may warrant field verification, technical review, preparedness planning or continuity planning.

The expected social value is better access to understandable, traceable evidence; stronger connections between satellite analysis and local realities; and more focused use of limited prevention and inspection resources. These are goals for the platform, not measured outcomes or claims that SAROS has already reduced losses.

## What makes SAROS different

- **From satellite pixels to people and livelihoods.** SAROS is designed to place physical observations alongside social and economic exposure, rather than treating a change map as the final answer.
- **An explainable, exploratory experience.** A 3D Earth view leads into site maps, acquisition dates, before/after comparisons, change layers, point-level time series and simple explanations of radar measurements.
- **Evidence and uncertainty stay visible.** Data provenance, dates, source maturity, demo/real status, coverage gaps and methodological limitations are part of the product. Missing data must not be mistaken for low risk.
- **Different concepts remain separate.** Observation, hazard, exposure, vulnerability and potential impact are not interchangeable. Relative screening priorities are not event probabilities, verified damage or monetary loss estimates.
- **Built for human review.** SAROS can help prioritize questions and inspections. Local experts and responsible authorities retain the role of validating evidence and making decisions.

## The experience today

The Next.js application opens with an interactive 3D Earth and a NISAR satellite flyover. Users can explore highlighted locations, open a site, browse its map layers over time, compare scenes with a swipe control, inspect a change layer, click the map for a time series and switch between English and Spanish. The current site catalog covers examples of landslide-related deformation in Colombia, subsidence in Mexico City, flooding in Bangladesh, glacier movement in Greenland and deforestation in Brazil.

The interface also includes territorial and socioeconomic views, headlines, and a SAROS assistant connected to stored evidence when the required backend configuration is available. These capabilities should be interpreted according to each view's provenance and status; the presence of a screen or model does not imply that its inputs have been validated for operational use.

## Current data and scientific status

This repository contains a working prototype and data-processing components, but it is not yet an operational hazard-monitoring service.

- **Explorer layers:** the packaged site layers currently used by the map are synthetic demo data shaped like NISAR products. The UI identifies demo provenance. They are not measurements from satellite scenes and must not be used as evidence of real movement, flooding or forest loss.
- **NISAR acquisition catalog:** the pipeline can search the ASF/NASA CMR catalog and, with Earthdata credentials, download products. Catalog availability is metadata; it does not by itself mean that a scene has been downloaded, processed, quality-controlled or validated.
- **Real LOS observations and forecasts:** the backend has routes and database schemas for provenance-tracked NISAR observations and exploratory forecasts. Valid operational-quality LOS time series still require calibrated processing, quality masks, connected-component checks, a stable reference and independent validation. Do not treat demo layers or raw phase as validated millimetre displacement.
- **Territorial and socioeconomic assessments:** the frontend supports an assessment contract and demo fixtures. Demo inventories and scenarios are illustrative, not official counts, verified exposure or damage. Real use requires dated, geographically appropriate source data and local review.
- **DIAN and impact models:** the repository includes a real monthly national DIAN collection and exploratory forecasting/model components. National tax receipts are not a local disaster-impact label and do not establish causality. Model outputs are screening or exploratory results, not calibrated disaster probabilities.
- **Supervised change detector:** the U-Net training and inference path requires expert-reviewed labeled patches and suitable spatial/temporal splits. Without those inputs and validation, its outputs are not an operational detector.
- **Assistant:** the LLM can explain stored evidence when configured; it does not create or validate satellite observations or forecasts.

Do not infer that a change means a disaster is imminent, that nearby assets have been damaged, or that an area with no data is safe. SAROS does not predict earthquakes. Routes, meeting points and recommendations, where present, are for planning and require local validation; they are not real-time evacuation instructions.

## Repository map

```text
frontend/       Next.js application, interactive globe, site explorer and assistant UI
backend/        Flask API, database-backed endpoints and model/assistant integrations
pipeline/       NISAR layer generation, search, ingestion, SQL migrations and data processing
scripts/        Earthdata/ASF utilities, territorial ingestion and DIAN import tools
ml/             NISAR change, composite and DIAN forecasting code
models/         Local model artifacts (may need to be trained or supplied)
data/           Local source, processed and training data (not all data is committed)
infra/saros/    Docker Compose deployment, Caddy integration and operations notes
docs/           Product vision, architecture, data status, model notes and delivery material
```

## Technology

- **Web:** Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js / React Three Fiber and MapLibre GL.
- **API:** Python 3.12 and Flask, served with Gunicorn.
- **Persistence:** PostgreSQL 16 with versioned SQL migrations.
- **Geospatial and ML processing:** Python tooling including NumPy, Rasterio, h5py, PyProj, Shapely and PyTorch/ONNX components.
- **Operations:** Docker Compose; the production setup integrates with the shared Orivia Caddy proxy.

See `frontend/package.json` and the per-component requirements files for exact dependency versions.

## Run the web application locally

### Requirements

- Node.js **24.14.x** (the frontend declares `>=24.14.0 <25`).
- npm, which is included with Node.js.

### Install and start

From the repository root:

```sh
cd frontend
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The frontend's `predev` script prepares the MapLibre worker. Without a configured API, the explorer can use packaged static site data and demo assessments where available.

To point the frontend at a SAROS API, copy `frontend/.env.example` to `frontend/.env.local` and set the public API origin (without `/api/v1`):

```dotenv
NEXT_PUBLIC_SAROS_API=http://localhost:8000
```

This is a public URL setting, not a place for secrets. Restart the development server after changing it. When using a separate API origin, configure that server's CORS policy for the frontend origin.

## Run the full container stack

The Compose project is in `infra/saros/docker-compose.yml`. It groups the SAROS web app, Flask API, PostgreSQL, NISAR predictor and optional processing/training/migration services.

1. Copy the root `.env.example` to `.env` and configure the database password and private tokens required by Compose. Keep `.env` out of version control.
2. Ensure Docker Engine and the Compose plugin are installed.
3. Start the stack from the repository root:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml up -d --build
```

The local web service is exposed inside Compose; for direct local browser access, publish a port in a local Compose override or run the frontend separately with `npm run dev`. The production Compose file expects an existing external Docker volume named `spaceapps2_postgres_data` and an external Orivia network. It is designed for the project's Orivia deployment and may need a local override for a standalone machine. **Do not remove the PostgreSQL volume** if it contains data you need.

Useful commands:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml ps
docker compose --env-file .env -f infra/saros/docker-compose.yml logs -f saros api
docker compose --env-file .env -f infra/saros/docker-compose.yml down
```

The `down` command above preserves named volumes. Avoid `down -v` on an environment with database data.

### Environment configuration

The root `.env.example` documents the available settings. The main groups are:

| Variables | Purpose |
| --- | --- |
| `SAROS_POSTGRES_*` | Database name, user and password. Production must preserve the credentials used by the existing database volume. |
| `SAROS_PREDICTION_TOKEN` | Bearer token for protected prediction and NISAR ingestion routes. |
| `SAROS_ASSISTANT_TOKEN`, `GROQ_API_KEY`, `GROQ_MODEL` | Private server-side assistant integration. |
| `SAROS_API_PUBLIC_URL` | Public API origin baked into the frontend image. |
| `EARTHDATA_USERNAME`, `EARTHDATA_PASSWORD` | Earthdata Login for downloading NISAR products; public catalog searches can be anonymous. |
| `NISAR_*` | Product family, maturity, date range, AOI and data directories for the NISAR pipeline. |
| `ML_*` | Training, inference limits, model paths and reproducibility settings. |

Never put credentials in `NEXT_PUBLIC_*`, frontend source, committed files or browser code. Production deployment details and proxy routing are in [infra/saros/README.md](infra/saros/README.md).

## Data workflows

### Explore and build NISAR layers

The frontend reads prebuilt JSON/PNG layers under `frontend/public/data`. `pipeline/build_layers.py` can generate demo layers or process downloaded scenes for exploratory visualization. Start with the [pipeline guide](pipeline/README.md):

```sh
python -m pip install -r pipeline/requirements.txt
python pipeline/build_layers.py --demo
```

Search the public catalog without logging in:

```sh
python pipeline/search_nisar.py
```

Downloading products requires Earthdata credentials. Read the pipeline guide before running a real-data workflow; the current GUNW layer extraction does not by itself satisfy the quality and reference requirements for validated LOS observations.

### Territorial, DIAN and hazard data

Scripts in `scripts/` support source ingestion, catalog filtering, territorial data loading and DIAN monthly data import. Their outputs, credentials and database prerequisites differ by workflow. Follow the [scripts guide](scripts/README.md) and the relevant [territorial data notes](docs/datos-territoriales-colombia.md) before loading data into a database.

### Database migrations

Versioned SQL files are in `pipeline/sql/`. The Compose `migration` profile applies selected NISAR, assistant and territorial schemas to the configured PostgreSQL service:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml --profile migration run --rm nisar-migrate
```

Review the migration files and the backend documentation when setting up a new database or applying a migration outside the supplied Compose environment.

## API overview

The Flask service in `backend/app.py` provides health/readiness routes and versioned endpoints for site catalogs, manifests, time series, data provenance, territorial assessments, predictions, NISAR observations/forecasts and the assistant. Protected routes use bearer-token authentication. The full route contracts, payload requirements, database setup and limitations are documented in [backend/README.md](backend/README.md).

The assistant uses a same-origin Next.js route at `/api/assistant`, which forwards to the private API. It summarizes stored evidence; it is not a model serving endpoint and does not independently generate scientific forecasts.

## Models and analysis

- [`ml/nisar_change/`](ml/nisar_change/README.md) contains a supervised U-Net change-detection baseline and inference service. It requires labeled, co-registered patches and leakage-aware splits.
- `ml/nisar_forecast/` contains an exploratory time-series forecast for real, quality-controlled LOS observations.
- `ml/dian_forecast/` contains exploratory forecasting for official monthly DIAN observations.
- `ml/nisar_change/train_composite.py` trains an exploratory composite analysis from NISAR features and historical impact records.

Each model has distinct inputs, targets and limitations. Read its documentation before interpreting results or preparing data; a model artifact is not automatically validated for operational decisions.

## Development commands

From `frontend/`:

```sh
npm run dev       # development server
npm run lint      # ESLint
npm run build     # production build
npm run start     # serve a production build
```

The Python components keep separate dependency files: `backend/requirements.txt`, `pipeline/requirements.txt`, `scripts/requirements.txt` and model-specific requirements under `ml/`. Use an isolated Python environment for each workflow.

## Project documentation

- Product and system: [vision and scope](docs/arquitectura/01-vision-y-alcance.md), [system architecture](docs/arquitectura/02-arquitectura-del-sistema.md), [technology stack](docs/arquitectura/03-stack-tecnologico.md), [API contracts](docs/arquitectura/05-api-y-contratos.md), [experience and recommendations](docs/arquitectura/06-experiencia-y-recomendaciones.md).
- Data and operations: [data and processing](docs/arquitectura/04-datos-y-procesamiento.md), [security and resilience](docs/arquitectura/07-seguridad-privacidad-y-resiliencia.md), [deployment and operations](docs/arquitectura/08-despliegue-y-operacion.md), [data catalog](docs/arquitectura/11-catalogo-de-datos.md).
- Project state: [real data ingestion](docs/ingesta-datos-reales.md), [Colombia territorial data](docs/datos-territoriales-colombia.md), [predictive models and assistant](docs/modelo-predictivo-y-asistente.md), [Space Apps delivery summary](docs/entrega.md).
- Component guides: [backend](backend/README.md), [NISAR pipeline](pipeline/README.md), [data scripts](scripts/README.md), [deployment](infra/saros/README.md), [NISAR change model](ml/nisar_change/README.md).

## Responsible use

SAROS is intended to inform exploration and prevention planning, not to issue official alerts or direct emergency response. Every public-facing assessment should identify its source, acquisition/evaluation date, geographic scale, method, quality and limitations. Keep uncertain or missing information explicit, protect sensitive personal data, and obtain local technical and community review before acting on a result.

For an immediate emergency, follow instructions from the relevant local authorities and established response channels.

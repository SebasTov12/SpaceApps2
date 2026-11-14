# SAROS en (casi) tiempo real: qué datos necesita la base y qué falta para NISAR

Hoy la interfaz lee archivos estáticos que genera el pipeline (`frontend/public/data/*`): `sites.json`, `manifest.json` de cada sitio con su `assessment` (nivel, tendencia, proyección a 30 y 90 días, puntos a vigilar), las capas PNG y `availability.json` con conteos reales de NASA CMR. Para que todo se actualice solo, esos mismos datos tienen que vivir en PostgreSQL. La interfaz los consultaría por API y recibiría los avisos sin recargar la página.

Este documento complementa `docs/modelo-sintesis-colombia.md` y `pipeline/sql/` (esquemas `dian`, `nasa` y `analysis`). No reemplaza nada de eso.

## 1. Tablas que hacen falta

Se propone un esquema `monitor` con PostGIS (`CREATE EXTENSION postgis`).

| Tabla | Para qué | Columnas clave |
|---|---|---|
| `monitor.zones` | Zonas vigiladas (hoy `risk-zones.ts` y `pipeline/sites.json`) | `id`, `name_es`, `name_en`, `kind` (subsidencia, ladera, inundación, volcán, deforestación…), `country`, `geom geometry(Polygon,4326)`, `priority`, `active` |
| `monitor.granules` | Escenas NISAR encontradas en CMR | `granule_ur` (único), `product` (GUNW/GCOV/GOFF), `maturity` (BETA/PROVISIONAL/V1), `track`, `frame`, `direction`, `start_time`, `end_time`, `footprint geometry`, `url`, `found_at`, `status` (nuevo / descargado / procesado / error) |
| `monitor.zone_granules` | Qué escenas cubren qué zona | `zone_id`, `granule_ur`, `coverage_pct` |
| `monitor.observations` | Serie de tiempo por zona (hoy `timeseries.json`) | `zone_id`, `date`, `metric` (mm LOS, área de agua km², pérdida de bosque km², velocidad m/día), `value`, `p95`, `granule_ur`, `run_id` |
| `monitor.layers` | Capas raster listas para el mapa | `zone_id`, `date`, `kind`, `url` (objeto en almacenamiento o COG), `bbox`, `colormap`, `run_id` |
| `monitor.assessments` | Lo que hoy es `manifest.assessment` | `zone_id`, `computed_at`, `level` (baja/moderada/alta), `accelerating`, `rate_early`, `rate_recent`, `projection_30d`, `projection_90d`, `hotspots geometry(MultiPoint)`, `model_version`, `run_id` |
| `monitor.alerts` | Avisos que se muestran en el cintillo y en el inicio | `id`, `zone_id`, `created_at`, `level`, `reason` (aceleración, umbral, nueva escena), `title_es`, `title_en`, `acknowledged`, `expires_at` |
| `monitor.events` | Referencias históricas (Mocoa 2017, Gramalote 2010…) | `zone_id`, `date`, `title_es`, `title_en`, `source_url`, `geom` |
| `monitor.recommendations` | Qué hacer por tipo de riesgo y nivel | `kind`, `level`, `country`, `text_es`, `text_en`, `source` (UNGRD, SGC, IDEAM) |
| `monitor.exposure` (opcional) | Personas e infraestructura cerca | `zone_id`, `population`, `schools`, `roads_km`, `source` (DANE, OSM) |
| `monitor.ingest_runs` | Bitácora del pipeline | `run_id`, `started_at`, `finished_at`, `granules`, `errors` |

Índices mínimos:
- GIST sobre `geom` y `footprint`.
- `(zone_id, date)` en `observations`.
- `(zone_id, computed_at DESC)` en `assessments`.

Cada fila guarda `run_id` y `model_version`, igual que `nasa.predictions`, para poder auditar o rehacer un cálculo.

> Los niveles de atención de SAROS **no son alertas oficiales**. En Colombia las alertas las emiten UNGRD, SGC e IDEAM, y la línea de emergencias es la 123. La tabla `alerts` debe llevar siempre esa aclaración y el enlace a la fuente.

## 2. Flujo de ingesta

```
cron cada 1–6 h
  └─ search_nisar.py      → consulta NASA CMR por zona (ya existe) → upsert en monitor.granules
       └─ granule nuevo   → descarga con earthaccess (credenciales Earthdata)
            └─ build_layers.py --real → observations + layers + assessments
                 └─ reglas → monitor.alerts  (nivel sube o hay aceleración)
                      └─ NOTIFY saros_alerts  →  API  →  SSE/WebSocket  →  interfaz
```

Endpoints sugeridos para la API del equipo:
- `GET /api/v1/zones`: zonas con su último `assessment`.
- `GET /api/v1/zones/{id}/timeseries`
- `GET /api/v1/zones/{id}/layers?date=`
- `GET /api/v1/headlines`: alertas y eventos para el cintillo, el mismo formato que `src/lib/headlines.ts`.
- `GET /api/v1/stream`: Server-Sent Events. Envía las nuevas filas de `alerts` usando `LISTEN saros_alerts`.

En el frontend basta con cambiar `loadSites()`, `loadManifest()` y `headlines.ts` para que lean de la API en lugar de `/data/`. Los tipos de `src/lib/sites.ts` ya tienen la forma correcta.

## 3. Qué falta para conectarse a NISAR

1. **Cuenta NASA Earthdata Login** (gratuita). Hay que aprobar la aplicación *ASF* en el perfil y guardar las credenciales en el servidor como `EARTHDATA_USERNAME`/`EARTHDATA_PASSWORD` o en `~/.netrc`. Nunca deben ir en el repositorio.
2. **Descarga**: `pip install earthaccess h5py` y descargar los granules que ya lista `search_nisar.py`. La búsqueda ya funciona sin credenciales; hoy encuentra 30 escenas en Bogotá, 48 en La Mojana, 42 en Caquetá y 35 en el Ruiz.
3. **Lectura de los HDF5 L2**. Las rutas internas de GUNW (desplazamiento *unwrapped*, coherencia, máscara) todavía no se han verificado contra un archivo real. Hay que abrir uno, confirmar los nombres de los grupos y ajustar `build_layers.py --real`. Lo mismo vale para GCOV (retrodispersión HH/HV, que se usa en inundación y bosque) y GOFF (velocidad de glaciares).
4. **Recorte y re-proyección** al bbox de cada zona (rasterio o GDAL) y conversión a COG o PNG.
5. **Almacenamiento** de las capas (disco del servidor, S3 o MinIO) servido por URL.
6. **Calibración de umbrales** con datos reales. Los de `assess()` (por ejemplo 15 mm/mes para "alta") se ajustaron con datos demo y deben validarse con el SGC.

## 4. Límite honesto: NISAR no es tiempo real

- NISAR revisita el mismo punto cada **12 días** (6 días combinando órbitas ascendente y descendente).
- Los productos L2 se publican con horas o días de retraso, y los primeros siguen en madurez BETA o PROVISIONAL.
- Por eso SAROS es **vigilancia continua con actualización por pasada**, no un sistema de alerta temprana instantánea. Sirve para ver dónde el terreno se acelera semana a semana y priorizar visitas, no para avisar de un deslizamiento en minutos.

Para acercarse al tiempo real en Colombia, conviene combinar NISAR con fuentes rápidas:

| Fuente | Qué aporta | Latencia |
|---|---|---|
| SGC | Sismos y boletines volcánicos | minutos |
| IDEAM | Lluvia, niveles de ríos y alertas hidrometeorológicas | horas |
| UNGRD | Emergencias declaradas | horas |
| GPM IMERG (NASA) | Lluvia satelital acumulada, el disparador de deslizamientos | ~4 h |
| Sentinel-1 (ESA) | Radar complementario entre pasadas de NISAR | ~1 día |

Una regla útil sería: aceleración NISAR en una ladera **más** lluvia acumulada alta (IMERG o IDEAM) en las últimas 72 h dan como resultado un nivel "alta" en `alerts`, con el enlace a la alerta oficial si existe.

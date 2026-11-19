# API de SAROS

La API está implementada en `backend/app.py` con Flask y Gunicorn. En el despliegue Compose se comunica con PostgreSQL y con el servicio privado de inferencia.

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/health` | Estado del proceso API. |
| `GET` | `/ready` | Comprueba dependencias y preparación de los servicios necesarios. |
| `GET` | `/api/v1/headlines` | Novedades basadas en registros y observaciones disponibles. |
| `GET` | `/api/v1/hazards/points` | Registros públicos de afectaciones agrupados por ubicación y tipo. Incluye fuente, periodo, métricas reportadas y precisión geográfica cuando está disponible. |
| `GET` | `/api/v1/nisar/scenes` | Escenas NISAR y metadatos de catálogo/activos registrados. |
| `GET` | `/api/v1/sites` | Catálogo de sitios del explorador. |
| `GET` | `/api/v1/sites/{site_id}/manifest` | Capas, fechas, leyendas y metadatos de un sitio. |
| `GET` | `/api/v1/sites/{site_id}/timeseries` | Serie disponible para un sitio. |
| `GET` | `/api/v1/sites/availability` y `/api/v1/sites/{site_id}/availability` | Disponibilidad de productos y cobertura por sitio. |
| `GET` | `/api/v1/regions/{zone_id}/assessment` | Evaluación territorial asociada a una región cuando existe evidencia suficiente. |
| `GET` | `/api/v1/datasets`, `/api/v1/manifest` | Inventario y procedencia de los conjuntos incorporados a la base. |
| `GET` | `/api/v1/models/status` | Disponibilidad del modelo compuesto, U-Net y tracks admitidos por el artefacto. |
| `GET` | `/api/v1/territorial/municipalities` | GeoJSON municipal, con filtro opcional por departamento. |
| `GET` | `/api/v1/territorial/municipalities/{divipola}` | Ficha territorial por código DIVIPOLA. |
| `GET` | `/api/v1/territorial/agriculture?divipola={codigo}&year={año}` | Información agrícola municipal disponible para el periodo solicitado. |
| `POST` | `/api/v1/analysis` | Análisis compuesto de fase y coherencia GUNW junto con contexto histórico. |
| `POST` | `/api/v1/predictions` | Inferencia de máscara de cambio mediante el predictor ONNX. |
| `POST` | `/api/v1/nisar/observations` | Ingesta idempotente de observaciones LOS con procedencia y controles de calidad. |
| `GET` | `/api/v1/nisar/observations/checkpoint` | Última fecha persistida de una serie AOI/stack/versión. |
| `GET` | `/api/v1/nisar/observations/series` | Series LOS reales que pasan umbrales de número de observaciones y validez; filtros opcionales por AOI. |
| `POST` | `/api/v1/nisar/forecasts/run` | Backtest y pronóstico LOS temporal desde observaciones aceptadas. |
| `POST` | `/api/v1/assistant/chat` | Respuesta contextual de SARU mediante el proveedor de lenguaje configurado. |

## Autenticación y proxy

Las operaciones de análisis, predicción, consulta de series/checkpoint, pronóstico e ingesta NISAR requieren `Authorization: Bearer <SAROS_PREDICTION_TOKEN>`. El chat de SARU usa el token privado `SAROS_ASSISTANT_TOKEN`. El frontend reenvía el chat mediante su endpoint same-origin `POST /api/assistant`; los secretos se mantienen en el servidor.

Configura `SAROS_INTERNAL_API_URL`, `SAROS_ASSISTANT_TOKEN`, `SAROS_PREDICTION_TOKEN`, `GROQ_API_KEY` y `GROQ_MODEL` en el entorno privado que corresponda. No publiques estos valores ni los incluyas en variables `NEXT_PUBLIC_*`.

La ficha de una afectación consulta DIVIPOLA, producción agrícola EVA, huellas/series del catálogo NISAR e inventario de procedencia. El contexto de chat de Saru consulta además el perfil municipal y una muestra reciente de producción agrícola EVA cuando existe DIVIPOLA; se entrega como contexto agregado, no como exposición o pérdida del evento. Las vistas delimitan cobertura espacial con las huellas publicadas por el backend; una escena o un resumen raster no se presenta como medición LOS del evento.

El panel de herramientas usa un proxy same-origin con cookie de sesión firmada, acceso por clave privada, validación de origen y límites de frecuencia. Se mantiene desactivado (`SAROS_ENABLE_MODEL_ACTIONS=false`) salvo que se configuren `SAROS_MODEL_TOOLS_ACCESS_KEY` (mínimo 24 caracteres) y `SAROS_MODEL_TOOLS_SESSION_SECRET` (mínimo 32), además del token Bearer. No pongas estas claves en `NEXT_PUBLIC_*`. El acceso habilita análisis compuesto, inferencia si el checkpoint U-Net existe y pronóstico solo desde series LOS reales elegibles (mínimo 5 observaciones con validez ≥ 50 % por defecto). La ingesta de observaciones no se expone como formulario público.

El análisis compuesto y U-Net reciben NPZ procesados por un operador; `scripts/prepare_gunw_analysis_npz.py` empaqueta fase y coherencia GUNW de COGs co-registrados con un manifiesto de hashes y ventana. La selección de ventana, track, unidades y procedencia sigue siendo responsabilidad de revisión científica. Los activos listados por `storage_uri` no se descargan ni se convierten automáticamente en el navegador. La operación U-Net permanece deshabilitada en la interfaz si el servicio no informa un `best.onnx` cargado.

## Observaciones LOS

La ingesta valida los campos AOI, stack, fecha, valor LOS, cobertura válida, método de referencia, granules de origen, colección, madurez, versión de procesamiento y calidad. La calidad debe identificar los hashes y rutas de los activos consultados, la geometría de referencia estable, el umbral de coherencia y los conteos de píxeles válidos/de referencia. Se rechazan valores no finitos, productos incompatibles y filas que no declaren procedencia real.

El pronóstico requiere una serie con la misma geometría y versión de procesamiento. Compara tendencia robusta con persistencia, persiste métricas y parámetros, y marca el resultado como exploratorio. El contrato completo está implementado en `backend/app.py` y documentado en [el método NISAR](../docs/modelos/modelo-predictivo-nisar.md).

## Base de datos y ejecución

Las migraciones SQL están en `pipeline/sql/`. Para aplicar el perfil versionado de migración:

```sh
docker compose -f infra/saros/docker-compose.yml --profile migration run --rm nisar-migrate
```

La configuración de servicios, salud, secretos y operación está en [infra/saros/README.md](../infra/saros/README.md). Los contratos de los datos territoriales se describen en [datos territoriales](../docs/datos/datos-territoriales-colombia.md).

# API y contratos

La API Flask usa el prefijo /api/v1. Las rutas de consulta devuelven JSON; las de ingesta, análisis y asistente validan el cuerpo y la configuración requerida.

## Consultas

| Método y ruta | Contenido |
|---|---|
| GET /health, GET /ready | Estado del proceso y dependencias |
| GET /api/v1/headlines | Actualizaciones recientes de la plataforma |
| GET /api/v1/hazards/points | Registros históricos agrupados por lugar y tipo |
| GET /api/v1/nisar/scenes | Huellas de escenas, pasadas y estadísticas disponibles |
| GET /api/v1/sites y rutas subordinadas | Catálogo del explorador, manifiestos, series y disponibilidad |
| GET /api/v1/regions/{id}/assessment | Evaluación territorial disponible o estado sin evaluación |
| GET /api/v1/datasets, GET /api/v1/manifest | Catálogo de datos y procedencia |
| GET /api/v1/territorial/municipalities | GeoJSON municipal, con filtro de departamento |
| GET /api/v1/territorial/municipalities/{divipola} | Perfil de un municipio |
| GET /api/v1/territorial/agriculture | Estadísticas agrícolas por municipio y periodo |

## Operaciones protegidas

| Método y ruta | Función |
|---|---|
| POST /api/v1/analysis | Análisis compuesto de características NISAR y contexto histórico |
| POST /api/v1/predictions | Inferencia del predictor de par de imágenes |
| POST /api/v1/nisar/observations | Ingesta idempotente de observaciones LOS con procedencia |
| GET /api/v1/nisar/observations/checkpoint | Fecha de referencia de una serie |
| POST /api/v1/nisar/forecasts/run | Backtest y pronóstico temporal |
| POST /api/v1/assistant/chat | Respuesta contextual del asistente |

Las rutas protegidas usan Bearer tokens privados. La ruta web /api/assistant reenvía la conversación al backend sin exponer el token al navegador. Los contratos detallados están en backend/README.md y ml/nisar_change/README.md.

## Reglas de interpretación

Los registros históricos describen lo que informan sus fuentes. Las evaluaciones de modelo deben mantener método, escala y fecha. Si no hay medición o evaluación disponible, el contrato debe devolver ausencia o insuficiencia explícita.

# Análisis y pronóstico NISAR

## Cobertura documentada

La caja data/aoi/neiva-core.geojson se utilizó para la consulta inicial de metadatos en Neiva, Huila. Es un AOI aproximado y debe reemplazarse por el polígono oficial del estudio antes de un análisis científico final.

La consulta del 14 de noviembre de 2026 encontró 84 granules que intersectaban el AOI. El catálogo registró 18 productos GUNW PROVISIONAL en dos stacks de nueve pares, ascendente 047/frame 003 y descendente 083/frame 087, modo 2000 SH. La caja amplia de Huila tuvo cobertura adicional y diferentes geometrías; no se deben combinar stacks o madureces sin armonizar el procesamiento.

Se generaron 227 COG recortados con NASA Harmony a partir de 58 granules provisionales GUNW, GCOV y SME2. Los metadatos de los activos incluyen granule, variable, unidades, cobertura válida, estadísticas, rejilla y checksum. El inventario público está en evidence/nisar/neiva/.

## Análisis de cambio y pronóstico

El modelo compuesto registrado en SAROS combina dos componentes:

1. Un cribado estadístico de anomalías basado en fase desenrollada y coherencia GUNW, ajustado por geometría orbital.
2. Un estimador empírico jerárquico de consecuencias históricas, entrenado con reportes UNGRD y evaluado en un periodo posterior.

La salida sirve para priorizar revisión. El índice de anomalía no es una clasificación de deslizamiento, y el estimador histórico no prueba que una señal NISAR haya causado un impacto.

El pronóstico temporal LOS se implementa por tendencia robusta comparada con persistencia. El baseline raster ajusta una tendencia Huber por píxel y evalúa fechas futuras completas. Solo acepta mapas LOS de adquisiciones reales que compartan una rejilla y referencia espacial estable, derivados tras invertir la red temporal de interferogramas. Fase, coherencia o disponibilidad de granules no reemplazan esos datos.

## Flujo de trabajo

1. Consultar ASF/CMR y seleccionar una colección y madurez compatibles.
2. Descargar o solicitar recortes mediante Earthdata/Harmony.
3. Inspeccionar variables, unidades, máscaras, componentes conectados, georreferenciación y hashes.
4. Controlar calidad y referencia estable en cada interferograma.
5. Invertir la red de pares para crear una serie LOS por adquisición, sin reemplazar faltantes por cero.
6. Separar geometrías orbitales y stacks, ejecutar backtest temporal y comparar con persistencia.
7. Registrar versión, métricas, insumos y limitaciones.

Los comandos de catálogo, exportación e inspección están en scripts/README.md.

## API y persistencia

La API ingiere observaciones validadas en POST /api/v1/nisar/observations y guarda la procedencia y calidad en nisar.observations. GET /api/v1/nisar/observations/checkpoint entrega el avance de una serie. POST /api/v1/nisar/forecasts/run ejecuta un backtest y guarda el resultado con su versión.

El contrato exige AOI, stack, fecha, LOS en milímetros, fracción válida, método de referencia, granules, madurez, versión y evidencia de calidad. El resultado se marca exploratorio hasta contar con una serie suficiente y evaluación independiente.

## Límites

- La caja de Neiva es aproximada.
- Los stacks ascendente y descendente no representan la misma geometría.
- Una estimación de consecuencias históricas no es una predicción de daño.
- Un backtest con pocas fechas no establece fiabilidad operativa.
- Los cambios de superficie requieren revisión técnica y territorial antes de orientar decisiones.

Fuentes: NASA-ISRO NISAR, ASF DAAC, NASA CMR y NASA Harmony.

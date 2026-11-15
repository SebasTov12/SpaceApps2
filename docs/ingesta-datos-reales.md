# Ingesta real de datos de amenazas y NISAR

## Alcance procesado

El piloto usa el AOI `neiva-core` y mantiene la procedencia original de cada fuente. Los seis endpoints entregados se descargaron y normalizaron en 13.470 registros (2.788 duplicados exactos removidos de UNGRD V1). La carga completa guarda en PostgreSQL el registro armonizado, la geometría disponible, las métricas, el payload original y la calidad:

| Fuente | Registros únicos |
| --- | ---: |
| Emergencias UNGRD V1 | 3.315 |
| Emergencias UNGRD V2 | 1.273 |
| Inventario nacional SGC | 6.826 |
| Deslizamientos Corpocaldas | 2.000 |
| Actividad sísmica IGAC | 6 |
| Alertas hidrometeorológicas de Sevilla | 50 |

Estas fuentes son inventarios, reportes de afectaciones y alertas. **No incluyen encuestas socioeconómicas de hogares**. Algunas son nacionales o departamentales y otras locales; la carga conserva esta diferencia y no las presenta como si describieran Neiva.

ASF catalogó 84 granules que intersectan el AOI: 18 GUNW provisionales, 21 GCOV, 23 GSLC, 1 GOFF y 20 SME2. Se descargaron recortes de las 58 granules provisionales GUNW, GCOV y SME2 mediante NASA Harmony. Los 227 COG verificados contienen:

- GUNW: fase desenrollada, coherencia, componentes conectados y máscara (72 COG).
- GCOV: HHHH, HVHV, máscara y número de looks (75 COG). Harmony no devolvió HVHV para cinco observaciones GCOV descendentes de modo SHSH.
- SME2: humedad del suelo, incertidumbre y banderas de calidad (80 COG). Una capa de incertidumbre quedó completamente nodata y está identificada en su metadato.

Los COG ocupan alrededor de 87 MB en el almacenamiento de archivos de Orivia. PostgreSQL guarda su registro, checksums SHA-256, grid, unidades, estadísticas y URI. Los bytes de ráster permanecen como archivos, no como columnas `bytea`.

La descarga de HDF5 completos se evita en este piloto: el catálogo estima unos 326 GB para los 84 granules, incluyendo aproximadamente 241 GB de GSLC, y no todos los productos admiten recorte espacial por Harmony. Los productos que no se recortaron siguen inventariados en la tabla de catálogo.

## Archivos locales

Los datos y artefactos están en carpetas ignoradas por Git bajo `data/`. No se deben subir esos directorios al repositorio. Las credenciales Earthdata están solo en el `.env` local ignorado; los endpoints públicos están en `afectaciones.env`.

Instala las dependencias desde la raíz del repositorio:

```powershell
python -m pip install -r scripts/requirements.txt -r pipeline/requirements.txt
```

```powershell
# Descargar las seis fuentes públicas indicadas en afectaciones.env
python scripts/ingest_hazard_sources.py

# Limpiar, normalizar, tipar y deduplicar exactamente
python scripts/normalize_hazard_sources.py

# Cargar los registros normalizados al PostgreSQL de Orivia por SSH
python scripts/load_hazards_to_server.py --dry-run
python scripts/load_hazards_to_server.py

# Actualizar catálogo ASF y guardarlo en PostgreSQL
python scripts/catalog_nisar_aoi.py
python scripts/load_nisar_catalog_to_server.py --dry-run
python scripts/load_nisar_catalog_to_server.py

# Exportar variables AOI-clipped, inspeccionar, empaquetar y registrar
python scripts/export_nisar_pilot_stack.py --batch-size 3
python scripts/package_nisar_assets.py
```

La exportación usa `.env` local y las cuentas Earthdata oficiales; no copia esas credenciales a Orivia. Los cargadores remotos usan `admin@orivia` y la llave SSH local.

## Estado de entrenamiento

Se entrenó un modelo compuesto exploratorio con dos ramas reales. La rama NISAR ajustó una distribución robusta de fase/coherencia para dos tracks GUNW: 7 observaciones por track para ajuste y las 2 últimas para diagnóstico temporal, con 264.684 píxeles válidos de entrenamiento. La rama de impacto ajustó estimadores con 3.315 eventos UNGRD de 2019–2022 y evaluó fuera de tiempo con 1.273 eventos de 2025. El reporte local `models/nisar-change/composite_training_report.json` guarda las métricas, divisiones y límites.

La reducción de MAE frente a la media global en 2025 fue: familias 7,76 vs. 10,30; personas 30,69 vs. 37,67; viviendas destruidas 0,51 vs. 0,78; viviendas averiadas 3,68 vs. 4,08. Son errores de estimación de consecuencias históricas reportadas, no exactitud de riesgo. La API y el asistente omiten visualmente el indicador de fallecimientos. La rama NISAR no tiene etiquetas expertas y solo ofrece una anomalía relativa; no calcula probabilidad de deslizamiento.

El U-Net supervisado sigue bloqueado hasta disponer de pares NISAR co-registrados y máscaras de cambio revisadas. El inventario de amenazas no sirve directamente como máscara por píxel ni está emparejado temporalmente con estas observaciones. La tabla `analysis.real_model_runs` conserva el estado bloqueado del U-Net y registra por separado el entrenamiento exploratorio del compuesto.

La carga de datos sí quedó registrada en `hazards.source_snapshots`, `hazards.records`, `nisar.catalog_assets` y `nisar.raster_assets`. El siguiente insumo para el componente socioeconómico es una fuente oficial, georreferenciada y compatible con el área de estudio (por ejemplo, indicadores DANE); el siguiente insumo para el cambio supervisado son etiquetas revisadas contra observaciones NISAR compatibles.

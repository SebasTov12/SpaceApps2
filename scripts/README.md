# Filtro de catálogo NISAR

Este script consulta las huellas del catálogo ASF que distribuye los productos NISAR disponibles en Earthdata y aplica tres filtros consecutivos:

1. Catálogo/plataforma NISAR, limitado por defecto al producto científico GUNW. Sin este filtro ASF también devuelve archivos auxiliares de órbita sin huella geográfica.
2. Intersección con la caja amplia de América (`-170,-60,-25,85`, orden oeste,sur,este,norte).
3. Intersección con una caja aproximada de Colombia (`-82.5,-5,-66.5,14`).

La caja de Colombia incluye territorio marítimo e islas, pero también toca países vecinos. Para seleccionar un AOI o límite político exacto, se debe afinar el resultado con un GeoJSON validado en un siguiente paso.

## Ejecución

El trabajador está empaquetado en el proyecto Compose de SAROS. Para ejecutar el filtro dentro de Docker desde la raíz del repositorio:

```sh
docker compose -f infra/saros/docker-compose.yml --profile processing run --rm processor
```

También se puede ejecutar directamente:

```sh
python -m pip install -r scripts/requirements.txt
python scripts/filter_nisar_colombia.py
```

Para resumir madurez, tracks/frames, pares temporales y tamaño HDF5 estimado desde el catálogo:

```sh
python scripts/analyze_nisar_colombia.py --input data/filtered/colombia-ladera/03_colombia_bbox.geojson
```

## Conexión con Earthdata Search/CMR

Earthdata Search sirve como interfaz; para scripts, el catálogo que responde es NASA CMR. Comprueba el login y la búsqueda desde el mismo `.env` con:

```sh
python scripts/connect_earthdata.py
```

El script hace login no interactivo con `EARTHDATA_AUTH_STRATEGY` (por defecto `environment`), busca las colecciones NISAR y, cuando `NISAR_PRODUCT_SHORT_NAME` está definido, consulta hasta 10 granules de esa colección sobre América. No imprime usuario, contraseña ni token. Para comprobar solo la búsqueda abierta del catálogo sin login:

```sh
python scripts/connect_earthdata.py --anonymous
```

La cuenta Earthdata se requiere para descargar o abrir los productos. Para NISAR, el acceso S3 directo requiere ejecutar en AWS us-west-2 y usar el endpoint S3 indicado en `.env`; desde un equipo local debe usarse acceso HTTPS/Earthdata. Este script de conexión solo consulta metadatos, no descarga datos.

Para descargar una cadena corta y de geometría consistente del piloto (se eligen pares GUNW consecutivos del GeoJSON de Colombia-ladera), primero revisa la selección y el tamaño sin descargar:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml --profile processing run --rm processor scripts/download_nisar_colombia.py --dry-run
```

Configura el Earthdata Login en `.env` del servidor y quita `--dry-run` para descargar. El script usa el acceso HTTPS de `earthaccess`, mantiene los HDF5 en el directorio elegido y escribe `download-manifest.json`. El parámetro `--maturity` acepta `PROVISIONAL` (predeterminado), `BETA` o `VALIDATED`; además separa los grupos por CRID para no encadenar versiones de procesamiento distintas. Con dos pares consecutivos, después inspecciona el HDF5 real; `build_layers.py --real` aún es solo exploratorio y no produce observaciones válidas para el pronosticador hasta que se apliquen coherencia, componentes conectados y referencia estable.

El script lee `.env` si existe. `NISAR_PRODUCT_SHORT_NAME`, `NISAR_DATA_MATURITY`, `NISAR_START_DATE` y `NISAR_END_DATE` son filtros opcionales; vacíos significa consultar todos los productos NISAR devueltos por ASF. `NISAR_COLOMBIA_BBOX` permite cambiar la caja. Los nombres de producto válidos incluyen colecciones como `NISAR_L2_GCOV_V1` o `NISAR_L2_GUNW_V1`; elegir un solo producto/madurez hace comparaciones más coherentes.

Se usa la interfaz `asf_search` dentro del rango asumido `>=10,<11`
(`scripts/requirements.txt` y `pipeline/requirements.txt`). Revisa los
parámetros actuales en el [ASF Cookbook](https://docs.asf.alaska.edu/api/cookbook/)
y la guía de [buenas prácticas de `asf_search`](https://docs.asf.alaska.edu/asf_search/BestPractices/).
El buscador no acepta `dataMaturity` como parámetro; el script traduce
`VALIDATED`, `PROVISIONAL` o `BETA` al `shortName` documentado de la colección.

Para inspeccionar el flujo con un límite pequeño:

```sh
python scripts/filter_nisar_colombia.py --max-results 100
```

Consulta los conteos completos del catálogo para NISAR, América y el AOI configurado; por defecto usa el nivel GUNW y la caja de Colombia. Guarda las huellas candidatas en `03_colombia_bbox.geojson` y el conteo en `00_summary.json` bajo `NISAR_FILTERED_DIR` (por defecto `data/filtered/`). `--max-results` limita únicamente cuántas huellas se guardan, no los conteos del catálogo. Son metadatos y geometrías, no imágenes descargadas ni entradas `.npz` listas para entrenar el modelo. Este paso no requiere publicar ni imprimir las credenciales del `.env`.

La búsqueda sigue las recomendaciones de ASF para filtrar el conjunto NISAR y procesar resultados paginados con `asf_search`. La autenticación Earthdata será necesaria al descargar/abrir productos, que es una etapa distinta a este inventario.

## AOI Neiva y pronóstico LOS

El polígono `data/aoi/neiva-core.geojson` guarda la caja aproximada usada en
el inventario inicial. Reemplázala con un límite oficial del estudio antes de
interpretar los resultados científicamente. El filtro existente acepta otra
caja explícita y puede guardar sus salidas fuera del repositorio:

```powershell
$env:NISAR_FILTERED_DIR = "C:/ruta/persistente/neiva-core"
python scripts/filter_nisar_colombia.py --colombia-bbox "-75.34,2.88,-75.24,2.98" --max-results 500
python scripts/analyze_nisar_colombia.py --input "C:/ruta/persistente/neiva-core/03_colombia_bbox.geojson"
python scripts/download_nisar_colombia.py --manifest "C:/ruta/persistente/neiva-core/03_colombia_bbox.geojson" --output "C:/ruta/persistente/neiva-h5" --products 2 --dry-run
```

El dry-run no descarga. Para descargar, habilita Earthdata en el entorno
privado del proceso y retira `--dry-run`. El entorno local no debe guardar
credenciales en Git. Los dos pares candidatos del stack descendente
083/frame 087 requieren aproximadamente 4.555 GB.

El 14 de noviembre de 2026 se consultó en el servidor la colección VALIDATED
`NISAR_L2_GUNW_V1`: ASF devolvió 140 granules a nivel global, 64 en América y
ninguno que interseque la caja núcleo de Neiva. Es una consulta de metadatos,
sin descarga. Los pares disponibles para el estudio local siguen siendo
PROVISIONAL; no mezclar ambas madureces sin armonizar el CRID y el procesamiento.

## Ajuste de tendencia por zona

Cuando el procesador científico haya producido el CSV documentado en
`docs/modelo-predictivo-nisar.md`, ejecutar:

```sh
python -m ml.nisar_forecast.forecast \
  --observations data/processed/neiva/los_observations.csv \
  --output models/nisar-forecast/neiva/forecast.json \
  --horizon-days 24 --tolerance-days 8
```

El módulo acepta mediciones reales de un AOI y stack, compara persistencia
con tendencia lineal robusta y genera JSON con procedencia y evaluación
temporal. No genera observaciones a partir de capas demo. El procesador
HDF5→CSV y la aplicación de la migración SQL son pasos pendientes hasta
disponer de acceso a los archivos y al entorno de base de datos.

Para inspeccionar hasta tres HDF5 descargados en el servidor sin cargar sus
matrices ráster en memoria:

```sh
docker compose -f infra/saros/docker-compose.yml --profile processing run --rm processor scripts/inspect_nisar_hdf5.py pipeline/data/neiva-core --max-files 3 --output pipeline/data/neiva-core/hdf5-inventory.json
```

El inventario reporta rutas, dimensiones, tipos y atributos. Los candidatos
por nombre son solo pistas; confirma semántica, unidades, georreferenciación y
calidad con la documentación oficial antes de procesar las matrices.

### Extracción recortada con Harmony

Un HDF5 GUNW reciente del AOI de Neiva tiene aproximadamente 2.28 GB. Como
alternativa para el servidor, Harmony puede extraer variables seleccionadas de
GUNW como COG GeoTIFF y recortarlas al bbox. El script consulta primero las
capacidades públicas de la colección; `--list-variables` imprime los nombres
disponibles en ese momento. No hay rutas de datasets codificadas en el script.
La descarga requiere Earthdata Login configurado en el `.env` privado.

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml --profile processing run --rm processor \
  scripts/export_nisar_harmony.py \
  --collection NISAR_L2_GUNW_PROVISIONAL_V1 --list-variables
```

Selecciona los nombres exactos que reporte Harmony y solicita un granule por
ejecución. El siguiente ejemplo muestra la forma del comando; sustituye cada
`--variable` por un nombre copiado de la salida anterior:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml --profile processing run --rm processor \
  scripts/export_nisar_harmony.py \
  --collection NISAR_L2_GUNW_PROVISIONAL_V1 \
  --granule-name NISAR_L2_PR_GUNW_... \
  --bbox=-75.34,2.88,-75.24,2.98 \
  --variable '<ruta de fase>' --variable '<ruta de coherencia>' \
  --variable '<ruta de máscara>' --variable '<ruta de componentes>' \
  --output pipeline/data/neiva-core/harmony/<granule-id>
```

La salida conserva un manifiesto con las rutas exactas entregadas por Harmony,
ID del job, tamaño y SHA-256 de cada COG. El proceso limita la consulta a un
granule y rechaza una carpeta de salida no vacía. Los COG todavía requieren
inspección de rejilla, máscara, unidades y metadatos antes de construir una
observación LOS. Harmony no elimina la necesidad de usar una referencia estable
ni de validar la conectividad temporal de pares.

### Actualización incremental desde el checkpoint SAROS

`update_nisar_catalog.py` consulta el último día de observación LOS real
persistido en SAROS API, consulta ASF desde esa fecha (incluyente) y conserva
solo productos cuyo día secundario sea posterior. Requiere que la serie inicial
ya exista; no inventa checkpoint, observaciones ni pronósticos. Actualiza un
GeoJSON pequeño de metadatos y no descarga HDF5:

```sh
docker compose --env-file .env -f infra/saros/docker-compose.yml --profile processing run --rm processor \
  scripts/update_nisar_catalog.py \
  --aoi-id neiva-core \
  --stack-id D-083-087-2000-SH \
  --processing-version nisar-los-v1 \
  --maturity PROVISIONAL
```

`SAROS_API_URL` y `SAROS_PREDICTION_TOKEN` se inyectan al contenedor desde el
`.env` privado. `--processing-version` debe coincidir exactamente con la
versión de las observaciones que generó el procesador. Cambia AOI, stack,
madurez y versión para consultar otra serie compatible. El endpoint de
checkpoint está protegido por el mismo Bearer token que la ingesta. Instala
`asf_search>=10,<11` (la imagen del servidor comprobada tenía 10.3.0) y revisa
los parámetros soportados en el
[ASF Cookbook](https://docs.asf.alaska.edu/api/cookbook/) y las
[buenas prácticas](https://docs.asf.alaska.edu/asf_search/BestPractices/).
Una vez actualizado el catálogo todavía hay que descargar y validar las capas
reales, procesarlas con el mismo `processing_version` e insertar observaciones
antes de poder ejecutar el backtest.

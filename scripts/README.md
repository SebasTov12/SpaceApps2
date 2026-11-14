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

El script lee `.env` si existe. `NISAR_PRODUCT_SHORT_NAME`, `NISAR_DATA_MATURITY`, `NISAR_START_DATE` y `NISAR_END_DATE` son filtros opcionales; vacíos significa consultar todos los productos NISAR devueltos por ASF. `NISAR_COLOMBIA_BBOX` permite cambiar la caja. Los nombres de producto válidos incluyen colecciones como `NISAR_L2_GCOV_V1` o `NISAR_L2_GUNW_V1`; elegir un solo producto/madurez hace comparaciones más coherentes.

Para inspeccionar el flujo con un límite pequeño:

```sh
python scripts/filter_nisar_colombia.py --max-results 100
```

Consulta los conteos completos del catálogo para NISAR, América y el AOI configurado; por defecto usa el nivel GUNW y la caja de Colombia. Guarda las huellas candidatas en `03_colombia_bbox.geojson` y el conteo en `00_summary.json` bajo `NISAR_FILTERED_DIR` (por defecto `data/filtered/`). `--max-results` limita únicamente cuántas huellas se guardan, no los conteos del catálogo. Son metadatos y geometrías, no imágenes descargadas ni entradas `.npz` listas para entrenar el modelo. Este paso no requiere publicar ni imprimir las credenciales del `.env`.

La búsqueda sigue las recomendaciones de ASF para filtrar el conjunto NISAR y procesar resultados paginados con `asf_search`. La autenticación Earthdata será necesaria al descargar/abrir productos, que es una etapa distinta a este inventario.

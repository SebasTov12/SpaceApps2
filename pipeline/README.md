# Pipeline de datos NISAR

Este paquete consulta el catálogo ASF/CMR, descarga productos autorizados y transforma archivos HDF5 disponibles en capas para el explorador de SAROS. El pipeline mantiene metadatos de adquisición y procedencia junto con sus salidas. Los registros de afectaciones y los conjuntos territoriales se cargan mediante los procesos de `scripts/`.

## Componentes

- `search_nisar.py`: consulta por sitio, colección, fechas y madurez; escribe el informe de catálogo y actualiza la disponibilidad que consume el frontend.
- `build_layers.py`: procesa los archivos NISAR disponibles para cada sitio y genera PNG, cambios entre fechas, series, leyendas y manifiestos bajo `frontend/public/data/`.
- `sites.json`: define AOI, producto, métrica, leyenda y metadatos de los sitios que usa este pipeline.
- `requirements.txt`: dependencias Python específicas del paquete.

## Preparación

```sh
python -m pip install -r pipeline/requirements.txt
```

La consulta pública de ASF/CMR no requiere autenticación. Descargar productos sí requiere credenciales Earthdata configuradas en el entorno privado (`EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD`). No guardes credenciales en el repositorio.

## Consultar y descargar escenas

```sh
python pipeline/search_nisar.py --list-collections
python pipeline/search_nisar.py
python pipeline/search_nisar.py --site colombia-ladera --start 2026-01-01 --end 2026-12-31
python pipeline/search_nisar.py --site colombia-ladera --download --limit 8 --maturity PROVISIONAL_V1
```

La consulta informa disponibilidad por colección y madurez en ASF. Los archivos descargados se guardan en `pipeline/data/<site-id>/`. Comprueba producto, geometría orbital, periodo y madurez antes de comparar escenas.

## Generar capas del explorador

Cuando los HDF5 requeridos están disponibles localmente:

```sh
python pipeline/build_layers.py --real --site colombia-ladera
```

El comando falla si faltan los productos o variables requeridos; no completa adquisiciones ausentes. Las salidas incluyen imágenes de capa, capa de cambio, serie temporal y manifiesto. Revisa el manifiesto y las estadísticas antes de publicar los archivos generados.

## Precauciones de procesamiento

- Mantén separadas las geometrías ascendentes y descendentes, los tracks/frames y las madureces incompatibles.
- Comprueba unidades, proyección, dimensiones, variables, máscara, coherencia, componentes conectados y cobertura válida en cada producto.
- La fase desenrollada GUNW no equivale directamente a desplazamiento LOS en milímetros. La conversión requiere validar convención de fase, longitud de onda, referencia y correcciones aplicables.
- Para generar una serie LOS se requiere inversión temporal de interferogramas con referencia espacial estable y controles de calidad. La generación de capas para visualización no sustituye ese procedimiento.
- El pronóstico LOS solo debe recibir observaciones persistidas con procedencia, rejilla, referencia y controles compatibles.

## Inventario documentado para Neiva

La consulta registrada el 14 de noviembre de 2026 encontró 84 granules que intersectaban el AOI aproximado de Neiva. La exportación asociada produjo 227 COG a partir de 58 granules GUNW, GCOV y SME2. Los archivos de evidencia y los metadatos del corte están en [evidence/nisar/neiva](../evidence/nisar/neiva/); la metodología y sus límites se describen en [el análisis NISAR](../docs/modelos/modelo-predictivo-nisar.md).

## Más información

- [Ingesta de datos](../docs/datos/ingesta-datos-reales.md)
- [Guía de scripts y cargas](../scripts/README.md)
- [Contrato de API](../backend/README.md)

# Datos y procesamiento

## Registros de afectaciones

Los procesos de ingesta reciben fuentes públicas, conservan su procedencia, normalizan campos y coordinadas, controlan duplicados y cargan registros en PostgreSQL. La API publica los registros con datos de fecha, ubicación, tipo de afectación e impactos reportados cuando la fuente los incluye.

La ubicación puede provenir de coordenadas del registro, del centroide de una geometría o del centroide municipal. La precisión se devuelve como metadato para que el mapa no presente una ubicación aproximada como coordenada exacta.

## NISAR

El catálogo ASF/CMR proporciona metadatos y huellas de escenas. Earthdata y NASA Harmony permiten acceder a los productos y solicitar recortes geográficos. Los archivos derivados se inspeccionan por contenido, rejilla, unidades, cobertura, máscara y procedencia antes de registrarse.

Para interpretar desplazamiento LOS se requiere una serie de adquisiciones compatible, inversión temporal de pares, referencia espacial estable y control de calidad. La fase o una anomalía estadística no deben presentarse como milímetros de movimiento sin validación de esas etapas.

## Contexto territorial

DANE, REPS, DANE SISE, UPRA y otras fuentes territoriales aportan variables a escala municipal o de servicio. La fecha, escala, unidad y cobertura de cada corte deben acompañar los resultados. Una variable municipal no identifica automáticamente una vivienda, parcela o activo afectado.

## Publicación

Los procesos guardan resultados versionados y el backend los expone mediante contratos JSON. La disponibilidad del catálogo, la salida del procesamiento y la evaluación del modelo se conservan como etapas diferentes.

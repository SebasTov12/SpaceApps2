# Ingesta de registros y productos geoespaciales

SAROS integra registros públicos de afectaciones y productos geoespaciales con procedencia conservada. La fecha y cobertura corresponden a cada carga y no deben interpretarse como conteo en tiempo real sin consultar la API.

## Registros de afectaciones

El proceso documentado reunió 13.470 registros normalizados de seis fuentes: UNGRD V1, UNGRD V2, inventario nacional SGC, inventario de deslizamientos de Corpocaldas, actividad sísmica IGAC y alertas hidrometeorológicas de Sevilla. Se removieron 2.788 duplicados exactos de la fuente UNGRD V1.

En ese corte, la distribución fue: 3.315 registros UNGRD V1, 1.273 UNGRD V2, 6.826 SGC, 2.000 Corpocaldas, 6 IGAC y 50 alertas de Sevilla. Son inventarios, reportes o avisos según la fuente; no todos representan una afectación confirmada ni una alerta vigente.

La ingesta conserva payload de origen, URI, fecha, geometría, métricas normalizadas y control de calidad. Si la fuente no proporciona coordenadas puntuales, el backend utiliza la precisión geográfica disponible y la devuelve como metadato.

## Catálogo y productos NISAR

En la consulta ASF/CMR documentada para el AOI de Neiva el 14 de noviembre de 2026 se registraron 84 granules intersectantes. El inventario procesado con NASA Harmony produjo 227 COG de 58 granules: 72 capas GUNW, 75 GCOV y 80 SME2. Los archivos se mantienen en almacenamiento de trabajo fuera de Git; PostgreSQL conserva metadatos, hashes, rejilla, unidades, estadísticas y URI.

GUNW aporta fase desenrollada, coherencia, componentes conectados y máscara; GCOV aporta covarianza polarimétrica y variables de calidad; SME2 aporta humedad del suelo, incertidumbre y banderas. Una capa de fase no es por sí sola una observación LOS en milímetros. Para esa magnitud hacen falta inversión temporal, referencia estable, cobertura válida y verificación de unidades y convenciones.

## Procedimiento

La configuración de URLs públicas de afectaciones se mantiene en el archivo local afectaciones.env, ignorado por Git. Las credenciales Earthdata permanecen en el archivo privado .env.

    python scripts/ingest_hazard_sources.py
    python scripts/normalize_hazard_sources.py
    python scripts/load_hazards_to_server.py --dry-run
    python scripts/load_hazards_to_server.py
    python scripts/catalog_nisar_aoi.py
    python scripts/load_nisar_catalog_to_server.py --dry-run
    python scripts/load_nisar_catalog_to_server.py
    python scripts/export_nisar_pilot_stack.py --batch-size 3
    python scripts/package_nisar_assets.py

Los comandos de descarga y exportación requieren las credenciales o configuración del proveedor. Los flujos detallados están en scripts/README.md. No guardar credenciales ni archivos geoespaciales voluminosos en Git.

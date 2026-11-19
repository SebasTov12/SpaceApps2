# Actualización y vigencia de los datos

SAROS combina datos de fuentes con distintas frecuencias de actualización. La fecha de adquisición, el periodo reportado y la fecha de consulta se conservan por separado para evitar presentar un inventario como una observación en vivo.

## Flujo actual

1. Los procesos de ingesta consultan las fuentes públicas y escriben un manifiesto con fecha, procedencia, cobertura y resultado.
2. Los registros normalizados se cargan en PostgreSQL con su fuente y geometría.
3. El backend consolida puntos y actualizaciones desde las tablas disponibles.
4. El frontend consulta los endpoints de SAROS y refresca sus datos según la caché configurada.
5. Los productos NISAR y capas ráster se registran por granule, variable, unidad, cobertura y checksum.

La barra de actualizaciones usa registros recientes disponibles y el catálogo NISAR. La selección abre el identificador geográfico asociado a la fuente. La hora de un evento no debe confundirse con la hora de ingestión ni con la hora de actualización del catálogo.

## Actualización de NISAR

El catálogo público ASF/CMR puede consultarse sin descargar los granules. La descarga y el recorte por NASA Harmony requieren Earthdata Login. Después de recibir un producto, el proceso debe validar geometría, fecha, madurez, rejilla, unidades y calidad antes de publicar estadísticas o crear una observación.

La ruta de pronóstico requiere una serie LOS real compatible por AOI, stack y versión de procesamiento. No se inicia un pronóstico solo porque haya escenas o archivos COG en el catálogo.

## Caches y continuidad

El frontend y el backend aplican cachés acotadas para reducir llamadas repetidas. Una carga nueva se refleja cuando termina la ingesta y vence la caché correspondiente. Los errores del servicio y la ausencia de cobertura deben permanecer visibles como estados distintos.

Para un flujo continuo se deben programar las consultas, registrar cada corte, detectar cambios de fuente y validar la publicación. SAROS no debe inferir que la falta de actualización equivale a ausencia de una amenaza.

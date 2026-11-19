# Plan de evolución

## Operación actual

- Consulta de registros públicos de afectaciones a través de la API y visualización geográfica.
- Catálogo NISAR consultable desde ASF/CMR y carga de escenas y capas recortadas con procedencia.
- API PostgreSQL para registros, catálogo, contexto territorial y resultados de análisis.
- Interfaz multilingüe con globo 3D, mapas, ficha territorial y asistente SARU.
- Servicios Docker Compose con publicación de imágenes y actualización controlada.

## Siguientes mejoras técnicas

1. Automatizar la actualización de las fuentes y publicar fecha de corte y estado de cada conjunto.
2. Completar la serie de observaciones LOS por AOI y stack con referencia espacial y control de calidad.
3. Ampliar la validación temporal y geográfica de los modelos con datos independientes.
4. Integrar perfiles territoriales recientes y documentar su cobertura por municipio.
5. Evaluar observaciones de usuarios, accesibilidad, rendimiento y funcionamiento ante fallos de servicios.

Cada incremento debe especificar fuente, fecha, escala, método, criterios de calidad y límites de interpretación.

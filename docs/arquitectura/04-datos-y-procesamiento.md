# 04. Datos y procesamiento NISAR

## Fuentes

NISAR L-band SAR, lluvia, elevación, pendiente, geología, cobertura, inventario de eventos, red vial, cierres y refugios. Para cada fuente registrar fecha, resolución, unidad, procedencia, licencia y vigencia. Comprobar disponibilidad real del producto para el área de interés.

## Pipeline propuesto

1. Descubrir productos que intersectan el área y periodo.
2. Registrar ID, origen, licencia, checksum y fechas.
3. Validar integridad, proyección, geometría, resolución y máscaras.
4. Recortar y alinear productos compatibles.
5. Calcular métrica SAR adecuada al fenómeno: cambio de retrodispersión, coherencia o deformación interferométrica.
6. Agregar contexto local sin ocultar procedencia.
7. Calcular atención con reglas o modelo validado, incertidumbre y limitaciones.
8. Revisar y publicar con manifiesto versionado.

## Persistencia propuesta

PostgreSQL/PostGIS para AOI, metadatos, observaciones, evaluaciones, rutas y revisiones. Almacenamiento de objetos para escenas y capas ráster; COG y teselas para lectura por ventana y mapa. Estas capacidades no están en el stack actual de Orivia.

## Evidencia

Cada resultado identifica producto, adquisición, proceso, métrica, unidad, calidad, algoritmo, versión, cobertura, factores auxiliares, confianza y estado de revisión. Admitir evaluación insuficiente.

## Controles

- No confundir desplazamiento radar LOS con movimiento vertical.
- No comparar geometrías incompatibles sin método documentado.
- No interpretar falta de señal como riesgo bajo.
- Medir falsas alarmas, omisiones, cobertura y calibración localmente.
- Separar cambio observado, contexto de amenaza y pronóstico.
- Validar con especialistas y eventos locales.

## Referencias

- [NISAR NASA](https://science.nasa.gov/mission/nisar/mission-overview/)
- [Acceso de datos ASF](https://nisar-docs.asf.alaska.edu/access-overview/)
- [Productos ASF](https://nisar-docs.asf.alaska.edu/products-overview/)


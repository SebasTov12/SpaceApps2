# 04. Datos y procesamiento NISAR

## Entradas

| Familia | Uso | Metadatos mínimos |
|---|---|---|
| NISAR L-band SAR | Cambio de retrodispersión y potencial deformación si el producto lo permite | ID, producto, órbita, adquisición, geometría, versión, calidad |
| Lluvia y meteorología | Contexto o condiciones disparadoras | Fuente, periodo, resolución, unidad, retraso |
| Elevación y pendiente | Contexto topográfico | DEM, datum, resolución, fecha |
| Geología, suelo y cobertura | Susceptibilidad e interpretación | Escala, fecha, clasificación, licencia |
| Inventario y observación de campo | Calibración y validación | Fecha, ubicación, precisión, protocolo |
| Red vial, cierres, refugios | Rutas y destino | Fuente, vigencia, acceso y capacidad conocida |

NISAR L-band se archiva en NASA Earthdata Cloud y se distribuye por ASF DAAC. Algunos datos S-band se distribuyen por ISRO/Bhoonidhi; cobertura y disponibilidad varían. Credenciales Earthdata solo en el servicio de ingesta.

## Flujo reproducible

1. Descubrir productos que intersectan el AOI y la ventana.
2. Registrar identificador, origen, licencia, versión y checksum.
3. Validar integridad, CRS, dimensiones, geometría y calidad.
4. Recortar AOI, armonizar grilla y aplicar máscaras con linaje.
5. Comparar fechas compatibles mediante diferencia, coherencia o deformación apropiada.
6. Asociar cada señal con lluvia, topografía, geología y eventos como evidencias separadas.
7. Calcular nivel de atención, horizonte, incertidumbre, explicación y limitaciones.
8. Revisar, versionar y publicar un manifiesto. Retirar versiones defectuosas.

## Registro de evidencia

Cada resultado identifica fuente, ID de producto, fecha de adquisición, fecha de procesamiento, métrica, unidad, máscara de calidad, algoritmo y versión. Incluir clase de datos insuficientes.

## Controles científicos

- No mezclar geometrías o productos incompatibles sin transformación documentada.
- Distinguir fechas de adquisición, procesamiento y publicación.
- No atribuir mayor resolución que la soportada por el producto y método.
- No traducir ausencia de señal o falta de cobertura en riesgo bajo.
- Evaluar falsas alarmas, omisiones, cobertura y calibración por subzona.
- Llamar “cambio observado” a la señal no confirmada, no “desastre inminente”.

## Fuentes

- [NISAR Mission Overview — NASA](https://science.nasa.gov/mission/nisar/mission-overview/)
- [Accessing NISAR Data — ASF DAAC](https://nisar-docs.asf.alaska.edu/access-overview/)
- [NISAR Data Products — ASF DAAC](https://nisar-docs.asf.alaska.edu/products-overview/)
- [Using NISAR Data — ASF DAAC](https://nisar-docs.asf.alaska.edu/using-overview/)


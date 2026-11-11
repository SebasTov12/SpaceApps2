# 04. Datos y procesamiento

## Flujo analítico

1. Descubrir productos y fuentes que intersectan el área del piloto.
2. Capturar procedencia, licencia, escala, fechas y versión.
3. Validar cobertura, calidad, sistema de referencia y compatibilidad temporal.
4. Preparar capas y derivar indicadores de cambio con método documentado.
5. Evaluar amenaza con contexto físico y validación experta.
6. Cruzar amenaza con exposición social, infraestructura y actividad económica.
7. Calcular prioridades relativas explicables, conservar dimensiones y limitaciones.
8. Formular acciones preventivas y revisión humana según el nivel de impacto.
9. Publicar una versión auditable con manifiesto.

## Familias de datos

### NISAR

- GUNW o productos interferométricos compatibles: deformación superficial cuando el producto, la coherencia y la geometría lo permitan.
- GSLC: señal compleja geocodificada; permite análisis de amplitud y pares compatibles.
- GCOV: retrodispersión con corrección radiométrica/topográfica para cambio de superficie y otras aplicaciones.
- SME2: humedad del suelo. Es contexto ambiental y agrícola, no indicador directo de deslizamiento.
- GOFF/ROFF: offsets por seguimiento de speckle; verificar el uso previsto del producto antes de aplicarlo a terreno continental.

La elección del producto depende de la pregunta. No sumar productos distintos como si fueran una sola medida.

### Contexto físico

Modelo de elevación, pendiente, geología, suelos, cobertura terrestre, lluvia, hidrología, inventario de deslizamientos, inundaciones o sismos y visitas de campo.

### Exposición social e infraestructura

Población y distribución espacial, viviendas, instituciones educativas, centros de salud, vías, puentes, servicios esenciales, accesibilidad y capacidad de respuesta. Registrar año, escala, unidad territorial y restricciones de privacidad.

### Exposición económica

Agricultura, ganadería, comercio, transporte/logística, turismo, infraestructura productiva y cadenas de abastecimiento. Usar indicadores observables y documentar si son censales, agregados, reportados o aproximaciones.

## Madurez y comparabilidad NISAR

El catálogo ASF reporta productos VALIDATED L0–L2 para adquisiciones L-band desde el 21 de octubre de 2026, publicados el 6 de noviembre de 2026. Productos anteriores pueden pertenecer a colecciones PROVISIONAL o BETA; no mezclar madureces sin documentar diferencias de procesamiento y comparabilidad temporal. SME2 aún no tiene la misma madurez VALIDATED según la guía consultada.

## Registro de cada resultado

Fuente e identificador, fecha de adquisición y procesamiento, AOI, resolución/escala, métrica/unidad, cobertura, calidad, transformación, método y versión, evidencia auxiliar, supuestos, limitaciones, nivel relativo y estado de revisión.

## Precauciones

No inferir probabilidad de evento ni costo de pérdidas sin datos/modelos validados. La intersección con edificios o cultivos representa exposición potencial, no daño observado. Mostrar vacíos de datos y desigualdad de resolución.

## Referencias

- [Productos y madurez NISAR — ASF](https://nisar-docs.asf.alaska.edu/products-overview/)
- [Disponibilidad — ASF](https://nisar-docs.asf.alaska.edu/availability-overview/)
- [Acceso — ASF](https://nisar-docs.asf.alaska.edu/access-overview/)
- [Resumen de misión — NASA](https://science.nasa.gov/mission/nisar/mission-overview/)


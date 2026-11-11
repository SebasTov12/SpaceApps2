# 11. Catálogo de datos para el piloto

Este catálogo organiza las fuentes que deben prepararse. No se fija aún una región, por lo que las filas de disponibilidad, resolución y custodia quedan por completar en la etapa de selección del AOI.

## Registro común

Cada dataset debe tener: ID, nombre, tema, fuente oficial, URL/identificador de descarga, cobertura, fechas válidas, frecuencia, resolución o escala, CRS/datum, formato, licencia, restricciones, madurez/calidad, fecha de consulta, transformación, responsable, uso analítico y limitaciones.

## Capas candidatas

| ID | Grupo | Fuente a investigar | Uso | Estado |
|---|---|---|---|---|
| SAR-GUNW | NISAR deformación | ASF DAAC, producto L2 GUNW compatible con el AOI | Evidencia de desplazamiento LOS | Ver disponibilidad y pares |
| SAR-GSLC | NISAR amplitud compleja | ASF DAAC L2 GSLC | Comparación de amplitud o análisis interferométrico propio | Seleccionar par compatible |
| SAR-GCOV | NISAR retrodispersión | ASF DAAC L2 GCOV | Cambios de superficie/inundación/cobertura | Validar polarizaciones y calidad |
| SAR-SME2 | NISAR humedad | ASF DAAC L3 SME2 | Contexto de humedad y agricultura | No usar como indicador directo de deslizamiento |
| DEM | Elevación | Producto oficial con escala apta para el AOI | Pendiente y terreno | Definir fuente y datum |
| RAIN | Lluvia | Servicio meteorológico oficial | Contexto antecedente del evento | Definir granularidad temporal |
| GEO | Geología/suelos | Servicio geológico y cartografía oficial | Susceptibilidad | Revisar escala |
| LANDCOVER | Cobertura | Catastro/cartografía oficial o producto satelital documentado | Terreno y activos | Revisar fecha |
| EVENTS | Inventario de eventos | Protección civil/servicio geológico | Validación y antecedentes | Solicitar acceso y precisión |
| POP | Población | Censo/estadística oficial agregada | Exposición social | Unidad y privacidad |
| HOUSING | Vivienda | Censo/catastro agregado | Exposición potencial | No publicar domicilios |
| SERVICES | Salud/educación | Registros oficiales | Servicios esenciales expuestos | Revisar vigencia |
| ROADS | Vías y puentes | Autoridad vial y cartografía abierta licenciada | Accesibilidad y posible interrupción | Añadir cierres si existen |
| ECON-ACT | Actividad productiva | Estadística/catastro agropecuario y cámaras/entidades públicas | Exposición económica sectorial | Documentar agregación |
| SUPPLY | Cadenas logísticas | Autoridades y asociaciones sectoriales | Dependencias indirectas | Validar evidencia |
| SHELTERS | Refugios/puntos de encuentro | Gestión local del riesgo | Planificación de rutas | Requiere validación local |

## Priorización de preparación

1. Definir AOI y amenaza.
2. Confirmar cobertura, producto y madurez de NISAR para el AOI.
3. Conseguir DEM, lluvia, geología y eventos para interpretar amenaza.
4. Armonizar población, vivienda, servicios y vías.
5. Identificar sectores productivos y dependencias logísticas.
6. Evaluar licencia, escala, fecha, sesgos, vacíos y privacidad.
7. Registrar transformaciones y preparar capas para análisis.

## Comparabilidad NISAR

En la guía ASF consultada al 10 de noviembre de 2026, colecciones VALIDATED L0–L2 incluyen adquisiciones L-band a partir del 21 de octubre de 2026 y se publicaron el 6 de noviembre. Productos anteriores pueden ser PROVISIONAL o BETA. No comparar maturidades como si las diferencias fueran cambios reales del terreno. SME2 no figura aún como VALIDATED en esa guía.

## Fuentes oficiales NISAR

- [Catálogo de productos y madurez ASF](https://nisar-docs.asf.alaska.edu/products-overview/)
- [Disponibilidad de datos ASF](https://nisar-docs.asf.alaska.edu/availability-overview/)
- [Acceso y distribución ASF](https://nisar-docs.asf.alaska.edu/access-overview/)
- [Descripción de productos NASA](https://science.nasa.gov/mission/nisar/mission-overview/)


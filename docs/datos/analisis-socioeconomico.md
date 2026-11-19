# Análisis socioeconómico territorial

SAROS relaciona los registros de afectaciones con variables territoriales agregadas cuando hay un perfil municipal y una fuente apropiada para el área consultada. El propósito es aportar contexto de población, vivienda, servicios y actividad productiva, no atribuir daños a hogares o parcelas sin evidencia georreferenciada.

## Fuentes disponibles

- DANE: Marco Geoestadístico Nacional y Censo Nacional de Población y Vivienda 2018.
- REPS: sedes de prestadores de salud agrupadas por DIVIPOLA.
- DANE SISE: sedes educativas, según disponibilidad del servicio de consulta.
- UPRA EVA: áreas, producción y rendimiento agrícola por municipio, cultivo y periodo.
- INVÍAS y Datos Abiertos: trazados viales para contextualizar infraestructura.

La fecha de corte y procedencia deben acompañar cada perfil. Las estadísticas de 2018 describen una base censal histórica, no la población actual de cada barrio o vivienda.

## Integración

El contrato de la interfaz se encuentra en frontend/src/lib/socioeconomic.ts. El adaptador territorial consulta los perfiles por API. La API publica:

- GET /api/v1/territorial/municipalities
- GET /api/v1/territorial/municipalities/{divipola}
- GET /api/v1/territorial/agriculture?divipola={código}&year={año}
- GET /api/v1/regions/{id}/assessment

Cuando una fuente o cobertura no está disponible, la respuesta debe conservar la ausencia y su explicación; no se debe convertir un dato ausente en cero.

## Alcance

Los totales municipales sirven para dar contexto de exposición y orientar una revisión. No identifican por sí solos qué vivienda, cultivo o establecimiento resultó afectado. Para evaluar pérdidas se requieren fuentes georreferenciadas, fechas compatibles con el evento y validación por las entidades responsables.

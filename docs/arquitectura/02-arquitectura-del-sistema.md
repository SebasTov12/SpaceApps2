# 02. Arquitectura del sistema

## Vista lógica

    Frontend Next.js
       | HTTPS + JWT
       v
    API Flask + Gunicorn
       +-- PostgreSQL / PostGIS
       +-- catálogo y metadatos de datos
       +-- worker de ingesta y análisis SAR
       +-- almacenamiento de objetos: productos, COG y resultados
       +-- módulos de exposición social y económica
       +-- priorización y recomendaciones
       +-- rutas y destinos, si hay datos suficientes
       +-- Ollama para explicar resultados estructurados
       +-- anclaje EVM opcional de hashes

    Caddy: TLS y reverse proxy
    Docker Compose: frontend, API, base de datos y proxy

## Estado actual del repositorio

Ya existe un frontend Next.js con recorrido visual y explorador territorial. Sus métricas, observaciones, capas y ejemplos de exposición son sintéticos y están etiquetados como demostración. El repo aún no contiene API/backend ni pipeline NISAR; los workers, almacenamiento geoespacial y servicios de riesgo descritos abajo son la arquitectura objetivo.

## Capas

### Aplicación

Next.js, React y TypeScript implementan landing, mapa, panel analista y vista territorial. Flask expone contratos versionados, autenticación, catálogos, resultados y publicación. PostgreSQL/PostGIS mantiene estado operativo y geometrías.

### Datos y análisis

Un catálogo registra fuente, licencia, cobertura, escala y vigencia. Los workers consultan productos NISAR y fuentes auxiliares, validan calidad y ejecutan análisis científico reproducible. Los productos grandes viven en almacenamiento de objetos; las capas livianas se publican como COG o teselas.

### Riesgo socioeconómico

El análisis mantiene dimensiones separadas:
- Indicadores de amenaza derivados de observaciones y contexto físico.
- Exposición de personas, viviendas, servicios y activos productivos.
- Vulnerabilidad y capacidad de respuesta, con variables documentadas.
- Dependencia entre sectores, por ejemplo vía interrumpida y acceso a mercado.

La prioridad se construye sobre esas evidencias y reglas versionadas. La interfaz no colapsa factores distintos en una cifra opaca.

### Asistencia e integridad

Ollama puede redactar una explicación basada en resultados ya calculados. No genera riesgo ni ejecuta decisiones. Un adaptador EVM opcional ancla hashes de publicación; PostgreSQL sigue como fuente de verdad.

## Flujo

Ingesta → control de calidad → detección de cambio → evaluación de amenaza → intersección con población, infraestructura y economía → priorización → recomendación → revisión y publicación → visualización.

Rutas y puntos de encuentro requieren fuentes locales validadas. El modelo de riesgo y sus umbrales requieren revisión experta.


# Arquitectura del sistema

## Componentes

    Navegador
      └─ Frontend Next.js
          ├─ Globo 3D y visor MapLibre
          ├─ Rutas de servidor para peligros, NISAR y asistente
          └─ Recursos públicos de visualización
                │ HTTPS / red interna
                ▼
    API Flask + Gunicorn
      ├─ PostgreSQL SAROS
      ├─ Predictor NISAR privado
      └─ rutas versionadas de consulta e ingesta

    Procesos de datos
      ├─ NASA ASF / Earthdata / Harmony
      ├─ UNGRD, SGC y demás fuentes públicas
      ├─ DANE, REPS, UPRA y datos territoriales
      └─ normalización, procesamiento y carga versionada

## Responsabilidades

El frontend presenta registros, catálogo y análisis, conserva la interacción geográfica y mantiene rutas de servidor para evitar solicitudes cruzadas innecesarias. Flask valida solicitudes, consulta PostgreSQL, consolida registros y comunica con el predictor. Los procesos científicos descargan, inspeccionan y preparan fuentes fuera del ciclo de petición del usuario.

PostgreSQL conserva metadatos, registros, observaciones, resultados y procedencia. Los rásteres y productos grandes se almacenan como archivos y se referencian mediante metadatos y hashes.

## Entornos

El proyecto Compose define web, API, base de datos y predictor. Los perfiles de procesamiento, entrenamiento y migración arrancan por separado. La publicación integra Caddy como proxy TLS externo.

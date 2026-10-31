# 02. Arquitectura del sistema

## Vista lógica

    Next.js: interfaz pública, mapa y paneles
       | HTTPS y Bearer JWT
       v
    Flask + Gunicorn
       +-- PostgreSQL y extensión PostGIS propuesta
       +-- worker de ingesta y análisis NISAR
       +-- almacenamiento de objetos para escenas y ráster derivados
       +-- servicio de riesgo y rutas
       +-- Ollama como explicación opcional de solo lectura
       +-- adaptador EVM opcional para anclar hashes

    Caddy proporciona TLS y reverse proxy.
    Docker Compose orquesta frontend, API, base de datos y proxy.

Frontend, Flask, PostgreSQL, Caddy y Compose siguen el patrón de Orivia. PostGIS, pipeline científico SAR, almacenamiento ráster y rutas son componentes nuevos de Terrasent.

## Componentes

### Frontend

Next.js, React y TypeScript para landing, mapa, detalle de zona y panel de analista. La API entrega datos y aplica permisos; no asumir PWA u operación offline completa.

### API

Flask con factory, blueprints, servicios y repositorios. Gunicorn ejecuta la aplicación. Módulos para AOI, observaciones, evaluaciones, recomendaciones, rutas, autenticación y auditoría.

### Datos

PostgreSQL conserva estado operacional. Añadir PostGIS para AOI e índices espaciales. Guardar productos NISAR y derivados en almacenamiento de objetos como COG o teselas. No cargar procesos SAR pesados en requests web.

### Pipeline

Worker consulta disponibilidad, registra linaje, valida metadatos y calidad, procesa productos comparables, combina factores auxiliares y publica resultados versionados.

### Ollama y EVM

Ollama resume evidencia estructurada; no decide nivel ni cambia estados. EVM puede anclar hash mínimo de publicación, sin datos sensibles. Ninguna de las dos integraciones debe bloquear la evaluación o consulta.

## Flujo

Ingesta -> control de calidad -> análisis SAR versionado -> factores de contexto -> evaluación explicable -> revisión humana cuando aplique -> publicación -> visualización.

NISAR mide propiedades de radar. El cambio detectado no es por sí mismo un pronóstico de desastre. Umbrales y modelos requieren validación local.


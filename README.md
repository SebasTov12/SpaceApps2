# Terrasent — arquitectura para NISAR

Documentación del sistema que usa NISAR para detectar cambios del terreno, estimar atención y orientar acciones y rutas. La referencia correcta de stack es [KHEZ09/hackathon_usco](https://github.com/KHEZ09/hackathon_usco).

## Documentos

- [Visión y alcance](docs/arquitectura/01-vision-y-alcance.md)
- [Arquitectura del sistema](docs/arquitectura/02-arquitectura-del-sistema.md)
- [Stack tecnológico](docs/arquitectura/03-stack-tecnologico.md)
- [Datos y procesamiento NISAR](docs/arquitectura/04-datos-y-procesamiento.md)
- [API y contratos](docs/arquitectura/05-api-y-contratos.md)
- [Experiencia y recomendaciones](docs/arquitectura/06-experiencia-y-recomendaciones.md)
- [Seguridad, privacidad y resiliencia](docs/arquitectura/07-seguridad-privacidad-y-resiliencia.md)
- [Despliegue y operación](docs/arquitectura/08-despliegue-y-operacion.md)
- [Decisiones](docs/arquitectura/09-decisiones-arquitectura.md)
- [Plan de implementación](docs/arquitectura/10-plan-de-implementacion.md)

El frontend Next.js/React/TypeScript, API Flask, PostgreSQL, Docker Compose y Caddy reflejan Orivia. PostGIS, procesamiento SAR, almacenamiento ráster y motor de rutas son extensiones propuestas para el reto, no componentes que existan en Orivia.

NISAR repite observaciones cada 12 días por ciclo exacto y promedia cerca de 6 días al combinar pasadas. No es una alerta inmediata. La app debe mostrar fechas, cobertura, calidad e incertidumbre. No sustituye autoridades ni evaluación profesional.


# Terrasent: arquitectura documental

Propuesta para el reto NASA Space Apps: usar observaciones NISAR para detectar cambios del terreno, estimar riesgos y convertirlos en recomendaciones y rutas accionables.

Estado: arquitectura de referencia para un prototipo. No sustituye a autoridades, alertas oficiales ni evaluación profesional.

La capa de experiencia conserva el stack web ligero de Orivia: HTML, CSS y JavaScript nativos, PWA, Service Worker y persistencia local primero. El procesamiento geoespacial ocurre en servicios de backend. La PWA consulta el último paquete aprobado aun sin conexión.

## Documentos

- [Visión y alcance](docs/arquitectura/01-vision-y-alcance.md)
- [Arquitectura del sistema](docs/arquitectura/02-arquitectura-del-sistema.md)
- [Stack tecnológico](docs/arquitectura/03-stack-tecnologico.md)
- [Datos y procesamiento NISAR](docs/arquitectura/04-datos-y-procesamiento.md)
- [API y contratos](docs/arquitectura/05-api-y-contratos.md)
- [Experiencia y recomendaciones](docs/arquitectura/06-experiencia-y-recomendaciones.md)
- [Seguridad, privacidad y resiliencia](docs/arquitectura/07-seguridad-privacidad-y-resiliencia.md)
- [Despliegue y operación](docs/arquitectura/08-despliegue-y-operacion.md)
- [Decisiones de arquitectura](docs/arquitectura/09-decisiones-arquitectura.md)
- [Plan de implementación](docs/arquitectura/10-plan-de-implementacion.md)

NISAR tiene un ciclo exacto de repetición de 12 días, con intervalo medio cercano a 6 días al combinar pasadas. No es una promesa de alerta inmediata. Toda capa muestra fechas, cobertura, calidad e incertidumbre. Las rutas requieren cartografía vial y destinos seguros validados.


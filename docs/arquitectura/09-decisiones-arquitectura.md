# 09. Decisiones de arquitectura

## ADR-001: adoptar el stack Orivia

Next.js/React/TypeScript para frontend; Flask/Gunicorn para API; PostgreSQL, Compose y Caddy para operación. Blockchain y Ollama son integraciones auxiliares.

## ADR-002: una amenaza principal para el piloto

Acotar región y fenómeno, preferiblemente deslizamientos si productos y validación lo permiten. Las demás amenazas son expansión, no promesa del prototipo.

## ADR-003: separar amenaza, exposición y vulnerabilidad

Mantener indicadores y procedencia por dimensión. La prioridad relativa debe ser interpretable y no fabricar probabilidad o pérdida monetaria.

## ADR-004: PostGIS y pipeline son extensiones

Agregar extensión espacial, worker SAR y almacenamiento ráster sin presentar esas piezas como existentes en Orivia.

## ADR-005: IA explica, metodología estima

Ollama resume evidencia estructurada. La evaluación proviene de método documentado y revisado. La IA no publica acciones.

## ADR-006: rutas de planificación requieren datos locales

Usar red, cierres y puntos de encuentro validados. No garantizar seguridad ni transitabilidad durante una emergencia.

## ADR-007: cadena es opcional

Anclar hashes solo si mejora auditoría; conservar PostgreSQL como fuente de verdad.


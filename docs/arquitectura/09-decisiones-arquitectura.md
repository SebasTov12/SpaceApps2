# 09. Decisiones de arquitectura

## ADR-001: adoptar el stack real de Orivia

Next.js, React y TypeScript para frontend; Flask y Gunicorn para API. Mantener Caddy, Docker Compose y PostgreSQL. No describirlo como PWA estática.

## ADR-002: PostGIS como extensión

PostgreSQL existente se amplía con PostGIS para AOI, geometrías e índices. Requiere migraciones y pruebas espaciales.

## ADR-003: pipeline SAR independiente

Workers procesan ráster fuera de requests web para aislar memoria, CPU y dependencias.

## ADR-004: explicación generativa no decide

Ollama resume evidencia; modelos/reglas revisados calculan atención. La publicación sensible requiere revisión autorizada.

## ADR-005: blockchain opcional

Anclar hash mínimo solo si aporta trazabilidad. La app opera con PostgreSQL si EVM falla.

## ADR-006: no inventar rutas

Devolver ruta solo con red vial, cierres y destino seguro vigentes. En otro caso, ofrecer canal oficial.


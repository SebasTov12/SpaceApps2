# 05. API y contratos

Mantener Flask y el prefijo /api/v1. JSON, fechas UTC, errores consistentes, X-Request-ID y autenticación Bearer JWT con permisos para administración. Acordar contratos antes de conectar Next.js.

## Recursos propuestos

| Método | Ruta | Función |
|---|---|---|
| GET | /health y /ready | Salud de aplicación y dependencias |
| GET | /api/v1/manifest | Versión y vigencia de conjuntos publicados |
| GET | /api/v1/areas | Áreas del piloto y cobertura |
| GET | /api/v1/datasets | Catálogo y procedencia de datos |
| GET | /api/v1/areas/{id}/observations | Cambios satelitales observados |
| GET | /api/v1/areas/{id}/exposure/social | Población, vivienda y servicios expuestos |
| GET | /api/v1/areas/{id}/exposure/economic | Sectores, activos y dependencias expuestos |
| GET | /api/v1/areas/{id}/risk | Amenaza, exposición, vulnerabilidad y prioridad |
| GET | /api/v1/areas/{id}/recommendations | Acciones y justificación |
| POST | /api/v1/routes | Rutas de planificación a destino validado |
| POST | /api/v1/admin/publications | Publicación restringida y auditada |
| GET | /api/v1/headlines | Titulares del cintillo: últimas actualizaciones de afectaciones |

## Recursos de dominio

Dataset: identificador, tema, fuente, fecha, cobertura, escala, licencia, madurez y calidad.

Observation: producto, adquisición, procesamiento, métrica, unidad, geometría, máscara, cobertura y método.

Exposure: tipo de activo o población, unidad, escala, fuente, periodo, intersección y limitaciones.

RiskAssessment: peligro, indicadores, exposición social/económica, vulnerabilidad, capacidad de respuesta, prioridad relativa, evidencia y revisión.

Recommendation: prioridad, acción, beneficiario/zona, motivo, fuentes, vigencia y responsable/canal.

## Reglas

- No devolver una cifra de probabilidad o pérdida monetaria sin base validada.
- Diferenciar exposición de daño confirmado.
- Hacer que cada indicador pueda trazarse a su fuente.
- Si falta cobertura, responder evaluación parcial o insuficiente.
- Ollama solo explica una salida estructurada existente.


## Titulares (cintillo del frontend)

`GET /api/v1/headlines` devuelve `{ "headlines": Headline[] }`, del más reciente al más antiguo:

```json
{
  "id": "asf-colombia-ladera-PROVISIONAL",
  "kind": "deformation | backscatter | velocity | data",
  "severity": "alta | media | baja | info",
  "title": { "es": "…", "en": "…" },
  "place": { "es": "…", "en": "…" },
  "time": "2026-10-08",
  "source": "NASA CMR · ASF DAAC",
  "demo": false,
  "siteId": "colombia-ladera"
}
```

El frontend lo pide a `NEXT_PUBLIC_SAROS_API` (ver `frontend/src/lib/headlines.ts`). Mientras no exista, arma los titulares con las escenas NISAR reales publicadas en ASF (`availability.json`) y las cifras de cada sitio, marcadas como demo. Un titular nunca debe presentar una exposición como daño confirmado.

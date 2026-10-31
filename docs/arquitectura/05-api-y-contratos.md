# 05. API y contratos

Conservar Flask y el prefijo /api/v1 de Orivia. JSON, timestamps UTC, errores consistentes y X-Request-ID. Rutas administrativas usan Bearer JWT y permisos. Definir contratos antes de conectar componentes Next.js.

## Recursos propuestos

| Método | Ruta | Uso |
|---|---|---|
| GET | /health y /ready | Estado de servicio y base |
| GET | /api/v1/manifest | Versiones, cobertura y vigencia |
| GET | /api/v1/areas | Áreas de interés |
| GET | /api/v1/areas/{id}/observations | Cambios y procedencia |
| GET | /api/v1/areas/{id}/risk | Evaluación, evidencia e incertidumbre |
| GET | /api/v1/areas/{id}/recommendations | Acciones priorizadas |
| POST | /api/v1/routes | Alternativas a destino validado |
| POST | /api/v1/admin/publications | Publicación restringida y auditada |

## Objetos

Observation incluye fuente, ID, fechas, métrica, unidad, geometría, calidad y versión de algoritmo.

RiskAssessment incluye área, vigencia, peligro, atención, horizonte, confianza, limitaciones, evidencia y revisión.

Recommendation incluye prioridad, acción, motivo, urgencia, área, fuentes, expiración y canal oficial.

Route incluye geometría, distancia, tiempo estimado, versión de red, restricciones, advertencias y cobertura.

## Límites de acción

La recomendación se calcula con reglas/modelo versionado. Ollama solo redacta una explicación de evidencia ya suministrada. Si faltan datos de red o destino, responder ruta no disponible, no inventar camino. PostgreSQL mantiene fuente de verdad; EVM solo ancla hashes opcionales.


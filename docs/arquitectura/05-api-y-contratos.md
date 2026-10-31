# 05. API y contratos

## Convenciones

- Base /api/v1; JSON UTF-8; GeoJSON para intercambio de geometrías.
- CRS explícito cuando no sea WGS84.
- Fechas ISO 8601 UTC.
- Respuestas incluyen generated_at, valid_until y dataset_version.
- Errores contienen code, message y request_id.
- API pública de lectura; publicación restringida a rol de analista.

## Recursos

| Método | Ruta | Propósito |
|---|---|---|
| GET | /health | Estado sin secretos |
| GET | /api/v1/manifest | Versión, vigencia, AOI y capas |
| GET | /api/v1/areas | Áreas piloto y cobertura |
| GET | /api/v1/areas/{id}/observations | Cambios y procedencia |
| GET | /api/v1/areas/{id}/risk | Factores, incertidumbre y límites |
| GET | /api/v1/areas/{id}/recommendations | Acciones priorizadas |
| POST | /api/v1/routes | Alternativas entre origen y destino validado |
| GET | /api/v1/layers/{id} | Metadatos y ubicación de una capa |
| POST | /api/v1/admin/publications | Validar y publicar, acceso restringido |

## Contrato de riesgo

Incluye ID, AOI, validez, fecha observada, peligro, nivel de atención, horizonte, confianza, limitaciones, evidencias, recomendaciones asociadas, versión de algoritmo y estado de revisión. La categoría insufficient_data siempre es posible.

## Contrato de recomendación

Incluye ID, prioridad, acción, razón, urgencia, área, fuentes, vencimiento y canal oficial. El texto es específico y neutral; el sistema no genera órdenes automáticas de evacuación.

## Contrato de ruta

Entrada: origen, destino seguro configurado, modo, accesibilidad y versión de datos esperada. Respuesta: alternativas, geometría, distancia, tiempo estimado, restricciones, fecha de actualización vial, cobertura del grafo y advertencias. Si falta red o destino validado, devuelve route_unavailable con explicación.

## Caché

El manifiesto usa ETag y versiones inmutables. La PWA descarga cambios incrementales. Cambios incompatibles requieren una versión mayor de API.


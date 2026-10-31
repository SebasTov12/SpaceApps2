# 08. Despliegue y operación

## Entornos

- Desarrollo: AOI pequeño, productos de prueba identificados y datos sintéticos cuando convenga.
- Staging: misma configuración que producción, claves separadas, revisión de publicación.
- Producción piloto: un AOI acotado, publicación versionada y respaldo operativo.

## Componentes desplegables

1. PWA estática servida por CDN o hosting web.
2. API FastAPI en contenedor.
3. Trabajos programados de búsqueda e ingesta.
4. Cola o ejecución por lotes para procesamiento pesado.
5. PostgreSQL/PostGIS administrado o respaldado.
6. Almacenamiento de objetos para COG, manifiestos y archivos de origen permitidos.

## Publicación

Construir -> validar contratos y capas -> generar manifiesto -> publicar API y datos -> publicar versión PWA -> verificar compatibilidad móvil y offline. El Service Worker usa versión de caché explícita para evitar mezclar shell nuevo y datos incompatibles.

## Observabilidad

Registrar latencia y errores de API, éxito y retraso de ingesta, duración de procesamiento, cobertura de AOI, última adquisición, vigencia de capas y errores de rutas. No registrar coordenadas de usuario ni secretos.

## Indicadores operativos

- Frescura por fuente y porcentaje de AOI cubierto.
- Tiempo desde adquisición hasta publicación.
- Porcentaje de productos con calidad aprobada.
- Disponibilidad de API y éxito de sincronización PWA.
- Rutas disponibles frente a solicitudes y porcentaje con red vigente.

## Respuesta a incidentes

Retirar una publicación incorrecta, fijar la PWA al último manifiesto confiable, avisar a responsables y dejar visible el estado de indisponibilidad. Mantener contacto y procedimiento acordados con autoridad del piloto.


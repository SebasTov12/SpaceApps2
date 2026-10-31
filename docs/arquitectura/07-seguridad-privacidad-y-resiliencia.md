# 07. Seguridad, privacidad y resiliencia

## Privacidad

La vista pública funciona sin cuenta y no necesita ubicación precisa. Si el usuario comparte ubicación, solicitar permiso explícito y procesarla localmente cuando sea posible. No almacenar rutas personales ni perfiles de hogar por defecto. Definir retención y consentimiento antes de incorporar reportes comunitarios.

## Seguridad

- HTTPS en tránsito y cifrado del almacenamiento administrado.
- Credenciales de Earthdata y llaves en gestor de secretos; rotación y mínimo privilegio.
- API pública de solo lectura, límites de frecuencia y validación de entradas.
- Consola de revisión con autenticación fuerte, roles y bitácora de publicación.
- Dependencias fijadas, imágenes escaneadas y despliegues reproducibles.
- Sanitizar datos vectoriales y evitar contenido activo en etiquetas o metadatos.
- Copias de seguridad de catálogo y configuración, con restauración ensayada.

## Integridad y auditoría

Cada publicación registra fuentes, checksums, método, parámetros, revisión, autoría operativa, timestamp y versión. Las correcciones crean versión nueva y conservan historial auditable.

## Resiliencia

- Si NISAR o una fuente auxiliar falla, conservar el último paquete dentro de su vigencia y mostrar antigüedad.
- Tras vencimiento, marcar la información como desactualizada y retirar instrucciones dependientes del estado actual.
- Si API cae, mostrar paquete local con banner de fecha y acceso offline.
- Si no hay evidencia suficiente, mostrar “sin evaluación disponible” y canales oficiales.
- Mantener página ligera con contactos y pasos básicos descargables.


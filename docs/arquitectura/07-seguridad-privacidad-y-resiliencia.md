# Seguridad, privacidad y resiliencia

## Secretos

Las claves de PostgreSQL, Earthdata, Groq y los tokens internos se configuran en el archivo privado de entorno del servidor. Nunca se publican con prefijo NEXT_PUBLIC, en el navegador, en registros de aplicación ni en Git. El repositorio ofrece .env.example sin credenciales.

## Red y servicios

Compose mantiene PostgreSQL, API y predictor en la red privada de SAROS. El proxy Caddy entrega HTTPS; solo los servicios web y API se exponen a las redes compartidas requeridas. El predictor y el procesador se comunican mediante servicios internos.

## Autorización y validación

Las rutas de ingesta, análisis y predicción requieren el token de operación. El proxy de conversación mantiene su token en servidor y limita el tamaño y frecuencia de solicitudes. La API valida campos, dimensiones y valores antes de persistir o enviar una entrada al predictor.

## Resiliencia y datos

Las consultas externas tienen límites de espera y errores explícitos. Los procesos de catálogo y procesamiento pueden repetirse sin reemplazar credenciales o datos de entrada. Las cargas guardan procedencia, hashes y versiones para permitir inspección posterior. Las ausencias se conservan como ausencias y no se convierten en indicadores de riesgo bajo.

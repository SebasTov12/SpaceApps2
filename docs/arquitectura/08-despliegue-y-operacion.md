# 08. Despliegue y operación

## Referencia Orivia

Docker Compose levanta frontend Next.js en Node 22, API Flask/Gunicorn en Python 3.12, PostgreSQL 16 y Caddy 2. Caddy termina TLS y enruta tráfico. PostgreSQL permanece interno. Lightsail Debian 13 y Tailscale aparecen en la documentación de staging Orivia; no asumir que están disponibles para Terrasent.

## Extensión Terrasent

Agregar PostGIS, almacenamiento de objetos y worker científico de ingesta/procesamiento. Mantener cálculos SAR fuera de requests de Flask. Secretos ASF y proveedores permanecen en servidor. Separar límites de recursos del worker y API.

## Flujo de despliegue

Build -> migraciones -> comprobar health/ready -> validar productos y capas -> revisión -> publicar manifiesto -> verificar mapa/API. Entornos de desarrollo, staging y piloto deben distinguir datos sintéticos y reales.

## Operación

Monitorear API, base, retraso de ingesta, duración de procesamiento, cobertura AOI, vigencia de capas, error de rutas e integraciones. No registrar información privada.

Mantener respaldo PostgreSQL y probar restauración. Ante dato incorrecto, retirar publicación y volver a una versión confiable con estado visible.


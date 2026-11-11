# 08. Despliegue y operación

## Base Orivia

Docker Compose de referencia levanta Next.js en Node 22, Flask/Gunicorn en Python 3.12, PostgreSQL 16 y Caddy 2. Caddy proporciona TLS y proxy; PostgreSQL queda en red privada. Lightsail Debian 13 y Tailscale corresponden al staging documentado de Orivia, no se asumen para el piloto sin confirmación.

## Extensiones del proyecto

Agregar PostGIS, almacenamiento de objetos y worker científico para ingestión/procesamiento. Separar límites de CPU y memoria del pipeline respecto a API. Mantener productos fuente, resultados y metadatos en rutas/versiones distintas.

## Ciclo de datos y publicación

Ingestar -> validar licencia y madurez -> revisar calidad/cobertura -> procesar -> cruzar exposición -> calcular prioridad -> revisión -> publicar manifiesto -> verificar frontend y API. Marcar claramente conjuntos sintéticos y resultados exploratorios.

## Métricas

Frescura de fuentes, cobertura territorial, errores de ingesta, duración de análisis, resultados insuficientes, revisión pendiente, latencia API, fallos de ruta y restauración de base.

## Incidente

Retirar una publicación incorrecta, conservar la versión auditada, mostrar aviso y coordinar corrección con responsable técnico y autoridad local.


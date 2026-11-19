# Despliegue y operación

## Servicios

El Compose de SAROS define frontend Next.js, API Flask, PostgreSQL y predictor ONNX. Procesamiento NISAR, entrenamiento y migraciones se ejecutan mediante perfiles independientes. Caddy proporciona TLS y enruta el tráfico público al frontend y a la API.

## Publicación

GitHub Actions construye imágenes versionadas en GHCR. El servicio programado del servidor revisa main y actualiza los contenedores cuando existe un avance lineal y el checkout está limpio. Si detecta divergencia o cambios locales, no reemplaza el contenido del servidor.

## Operación de datos

1. Consultar y registrar la fuente y el periodo.
2. Descargar o recortar los productos con las credenciales necesarias.
3. Validar geometría, rejilla, unidades, cobertura y hashes.
4. Cargar metadatos y productos derivados con versión.
5. Comprobar API, visor y logs después de publicar el cambio.

No ejecutar procesamiento pesado ni entrenamiento en producción. El detalle de servicios, perfiles, respaldos y despliegue está en infra/saros/README.md.

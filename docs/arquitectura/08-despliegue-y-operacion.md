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

## Rendimiento visual del frontend

- La escena 3D mantiene la textura de máxima resolución en escritorio. Los dispositivos móviles y de recursos limitados descargan una variante WebP dimensionada para su resolución visible; el relieve, las nubes y las capas del planeta siguen activos.
- El código de MapLibre se precarga durante tiempo ocioso solo en equipos sin ahorro de datos y con recursos suficientes. En los demás casos se solicita al entrar a una zona, para no competir con la carga inicial del globo.
- Las animaciones 3D y decorativas se pausan cuando la escena sale de pantalla o la pestaña deja de estar visible.

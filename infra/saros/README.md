# SAROS en Orivia

El proyecto Compose `spaceapps2` empaqueta los servicios de SAROS: frontend Next.js, API Flask, PostgreSQL y predictor NISAR ONNX. Cada servicio corre en su contenedor; Compose coordina su arranque y sus redes. La API conecta con `spaceapps2-postgres`: el alias genérico `postgres` en la red compartida pertenece a la base distinta `orivia`. Caddy sigue siendo el proxy compartido de Orivia y se conecta al frontend y a la API por la red privada externa.

## Preparación

1. Copia `.env.example` a `.env` en la raíz del repositorio.
2. En Orivia conserva en `SAROS_POSTGRES_PASSWORD` exactamente la contraseña configurada en el contenedor PostgreSQL actual. El volumen `spaceapps2_postgres_data` ya contiene sus datos.
3. Genera `SAROS_PREDICTION_TOKEN` con un valor aleatorio largo.
4. Configura un registro DNS `A` para `saros.tobaru.xyz` apuntando a la IP pública del servidor. Si Cloudflare tiene el proxy activo, configura su modo SSL/TLS como **Full (strict)**.

No levantes otro PostgreSQL sobre `spaceapps2_postgres_data` mientras `spaceapps2-postgres` esté ejecutándose. Para migrar el servicio manual al Compose, conserva el volumen, detén y retira solo el contenedor antiguo, y luego inicia el proyecto.

## Despliegue

Desde la raíz del repositorio:

```sh
docker compose -f infra/saros/docker-compose.yml up -d --build
```

Agrega el bloque de `Caddyfile` al Caddyfile activo de Orivia y valida/recarga Caddy. Caddy obtiene y renueva automáticamente el certificado TLS para `saros.tobaru.xyz`; para ello el DNS debe resolver al servidor y los puertos 80/443 deben llegar a Caddy. La ruta `/api/*` llega a Flask; las demás rutas llegan al frontend. La base de datos y el predictor solo están disponibles en la red privada de SAROS. No ejecutes `docker compose down -v`: el volumen PostgreSQL contiene los datos.

### Actualización automática desde `main`

En Orivia, instala el servicio y timer versionados en `systemd/` y habilita el timer:

```sh
sudo install -m 0644 infra/saros/systemd/spaceapps2-auto-update.service /etc/systemd/system/
sudo install -m 0644 infra/saros/systemd/spaceapps2-auto-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spaceapps2-auto-update.timer
```

Cada 10 minutos el host revisa `origin/main`. Si hay un fast-forward y el checkout está limpio, hace pull y reconstruye/actualiza `saros`, `api` y `predictor`. Omite dependencias: en Orivia PostgreSQL ya corre en un contenedor existente que no pertenece a este Compose. Si detecta cambios locales o una divergencia, se detiene sin sobrescribirlos. Consulta el resultado con `journalctl -u spaceapps2-auto-update.service`.

El trabajador de filtros y capas se ejecuta bajo el perfil `processing`:

```sh
docker compose -f infra/saros/docker-compose.yml --profile processing run --rm processor
```

El contenedor de procesamiento usa una red de salida dedicada para consultar ASF/CMR y descargar productos por HTTPS; no se conecta a la red privada de la base. La búsqueda pública del catálogo no requiere Earthdata Login. La descarga sí requiere `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en `.env`. El acceso S3 directo de NISAR solo funciona desde AWS `us-west-2`; desde otras regiones usa el flujo HTTPS de `earthaccess`.

El entrenamiento se ejecuta bajo el perfil `training` y escribe `best.onnx` en `models/nisar-change/`, donde el predictor lo monta como solo lectura.

## Estado esperado

```sh
docker compose -f infra/saros/docker-compose.yml ps
```

Frontend, API y PostgreSQL deben estar saludables. El predictor queda `unhealthy` hasta que exista `models/nisar-change/best.onnx`; el resto del stack puede iniciar mientras se prepara y valida el modelo. `/ready` informa la disponibilidad de PostgreSQL y del predictor.

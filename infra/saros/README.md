# SAROS en Orivia

El proyecto Compose `spaceapps2` empaqueta los servicios de SAROS: frontend Next.js, API Flask, PostgreSQL y predictor NISAR ONNX. Cada servicio corre en su contenedor; Compose coordina su arranque y sus redes. Caddy sigue siendo el proxy compartido de Orivia y se conecta al frontend y a la API por la red privada externa.

## Preparación

1. Copia `.env.example` a `.env` en la raíz del repositorio.
2. En Orivia conserva en `SAROS_POSTGRES_PASSWORD` exactamente la contraseña configurada en el contenedor PostgreSQL actual. El volumen `spaceapps2_postgres_data` ya contiene sus datos.
3. Genera `SAROS_PREDICTION_TOKEN` con un valor aleatorio largo.
4. Configura un registro DNS `A` para `saros.tobaru.xyz` apuntando a la IP pública del servidor.

No levantes otro PostgreSQL sobre `spaceapps2_postgres_data` mientras `spaceapps2-postgres` esté ejecutándose. Para migrar el servicio manual al Compose, conserva el volumen, detén y retira solo el contenedor antiguo, y luego inicia el proyecto.

## Despliegue

Desde la raíz del repositorio:

```sh
docker compose -f infra/saros/docker-compose.yml up -d --build
```

Agrega `Caddyfile.snippet` al Caddyfile activo de Orivia y valida/recarga Caddy. La ruta `/api/*` llega a Flask; las demás rutas llegan al frontend. La base de datos y el predictor solo están disponibles en la red privada de SAROS. No ejecutes `docker compose down -v`: el volumen PostgreSQL contiene los datos.

El trabajador de filtros y capas se ejecuta bajo el perfil `processing`:

```sh
docker compose -f infra/saros/docker-compose.yml --profile processing run --rm processor
```

El entrenamiento se ejecuta bajo el perfil `training` y escribe `best.onnx` en `models/nisar-change/`, donde el predictor lo monta como solo lectura.

## Estado esperado

```sh
docker compose -f infra/saros/docker-compose.yml ps
```

Frontend, API y PostgreSQL deben estar saludables. El predictor queda `unhealthy` hasta que exista `models/nisar-change/best.onnx`; el resto del stack puede iniciar mientras se prepara y valida el modelo. `/ready` informa la disponibilidad de PostgreSQL y del predictor.

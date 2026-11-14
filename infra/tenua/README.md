# TENUA en Orivia

Despliega el frontend TENUA como proyecto Docker independiente y lo conecta a la red privada existente de Orivia. No reconstruye ni modifica los servicios API o PostgreSQL.

## Requisitos en el servidor

- Docker Engine y Docker Compose v2.
- Red Docker existente `orivia-server_orivia_private` (o `ORIVIA_DOCKER_NETWORK` con el nombre real).
- Caddy existente en Orivia, configurado para leer un snippet de este proyecto.
- Un registro DNS `A` para `tenua.tobaru.xyz` que apunte a la IP pública del servidor.

## Despliegue

Desde la raíz de este repositorio, en el servidor:

```sh
docker compose -f infra/tenua/docker-compose.yml up -d --build
```

Agregar el contenido de `Caddyfile.snippet` al Caddyfile ya montado por el servicio `web` de Orivia y validar/recargar Caddy desde el proyecto Orivia. La configuración del proxy debe conservar los sitios existentes.

## Retirada

```sh
docker compose -f infra/tenua/docker-compose.yml down
```

Esto elimina únicamente el servicio TENUA y preserva la red externa y los servicios de Orivia.

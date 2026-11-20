# SAROS en Orivia

El proyecto Compose `spaceapps2` empaqueta los servicios de SAROS: frontend Next.js, API Flask, PostgreSQL y predictor NISAR ONNX. Cada servicio corre en su contenedor; Compose coordina su arranque y sus redes. La API conecta con `spaceapps2-postgres`: el alias genérico `postgres` en la red compartida pertenece a la base distinta `orivia`. Caddy sigue siendo el proxy compartido de Orivia y se conecta al frontend y a la API por la red privada externa.

## Preparación

1. Copia `.env.example` a `.env` en la raíz del repositorio.
2. En Orivia conserva en `SAROS_POSTGRES_PASSWORD` exactamente la contraseña configurada en el contenedor PostgreSQL actual. El volumen `spaceapps2_postgres_data` ya contiene sus datos.
3. Genera `SAROS_PREDICTION_TOKEN` con un valor aleatorio largo.
4. Mantén `SAROS_ENABLE_MODEL_ACTIONS=false` para dejar apagado el cómputo desde la interfaz. Si lo habilitas, configura en el `.env` privado `SAROS_MODEL_TOOLS_ACCESS_KEY` (al menos 24 caracteres aleatorios) y `SAROS_MODEL_TOOLS_SESSION_SECRET` (al menos 32), y luego cambia el flag a `true`. No reutilices el token Bearer como clave de acceso.
5. Configura un registro DNS `A` para `saros.tobaru.xyz` apuntando a la IP pública del servidor. Si Cloudflare tiene el proxy activo, configura su modo SSL/TLS como **Full (strict)**.

No levantes otro PostgreSQL sobre `spaceapps2_postgres_data` mientras `spaceapps2-postgres` esté ejecutándose. Para migrar el servicio manual al Compose, conserva el volumen, detén y retira solo el contenedor antiguo, y luego inicia el proyecto.

## Despliegue

Para desarrollo local, desde la raíz del repositorio:

```sh
docker compose -f infra/saros/docker-compose.yml up -d --build
```

Agrega el bloque de `Caddyfile` al Caddyfile activo de Orivia y valida/recarga Caddy. Caddy obtiene y renueva automáticamente el certificado TLS para `saros.tobaru.xyz`; para ello el DNS debe resolver al servidor y los puertos 80/443 deben llegar a Caddy. `/api/assistant` llega al frontend Next.js, `/api/v1/*` y las rutas de salud llegan a Flask, y las demás rutas llegan al frontend. La base de datos y el predictor solo están disponibles en la red privada de SAROS. No ejecutes `docker compose down -v`: el volumen PostgreSQL contiene los datos.

El chat usa la ruta de servidor del frontend `POST /api/assistant`, que reenvía a Flask por la red Docker privada. Caddy debe dirigir exactamente `/api/assistant` al frontend y `/api/v1/*` a Flask, como en este `Caddyfile`; no envíes `/api/assistant` directamente a Flask.

La clave de Groq se configura en el `.env` privado de la raíz del proyecto en Orivia (`/home/admin/spaceapps2/.env`), en la variable `GROQ_API_KEY`. Configura también `SAROS_ASSISTANT_TOKEN` con el mismo valor en el frontend y en la API; el frontend lo usa solo en servidor para autenticar su proxy interno. No guardes ninguna de estas claves en `frontend/.env`, `NEXT_PUBLIC_*`, el navegador ni Git. Protege el `.env` con `chmod 600`.

### Actualización automática desde `main`

En Orivia, instala el servicio y timer versionados en `systemd/` y habilita el timer:

```sh
sudo install -m 0644 infra/saros/systemd/spaceapps2-auto-update.service /etc/systemd/system/
sudo install -m 0644 infra/saros/systemd/spaceapps2-auto-update.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now spaceapps2-auto-update.timer
```

Un workflow de GitHub Actions construye y publica las imágenes del frontend, API y predictor en GHCR, etiquetadas con el SHA completo del commit. El auto-deploy de Orivia descarga esa etiqueta antes de aplicar migraciones o reemplazar contenedores; si todavía no está disponible o falla la descarga, conserva los contenedores actuales y vuelve a intentar en el siguiente ciclo. Orivia ya no compila esos tres servicios, evitando el pico de memoria de Next.js en la VM de 2 GiB. El Compose conserva los bloques `build` para desarrollo local.

Cada minuto el host revisa `origin/main`. Si hay un fast-forward y el checkout está limpio, hace pull y actualiza `saros`, `api` y `predictor` usando las imágenes inmutables de GHCR. Omite dependencias: en Orivia PostgreSQL ya corre en un contenedor existente que no pertenece a este Compose. Si detecta cambios locales o una divergencia, se detiene sin sobrescribirlos. Consulta el resultado con `journalctl -u spaceapps2-auto-update.service`.

Las imágenes deben poder descargarse desde Orivia. Si los paquetes GHCR son privados, configura un token de solo lectura (`read:packages`) con `docker login ghcr.io` en el servidor antes de activar este flujo. No pongas el token en Git ni en los logs.

El trabajador de filtros y capas se ejecuta bajo el perfil `processing`:

```sh
docker compose -f infra/saros/docker-compose.yml --profile processing run --rm processor
```

El contenedor de procesamiento usa una red de salida dedicada para consultar ASF/CMR y descargar productos por HTTPS; no se conecta a la red privada de la base. La búsqueda pública del catálogo no requiere Earthdata Login. La descarga sí requiere `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en `.env`. El acceso S3 directo de NISAR solo funciona desde AWS `us-west-2`; desde otras regiones usa el flujo HTTPS de `earthaccess`.

Para leer COGs ya registrados, `SAROS_NISAR_DATA_HOST_PATH` debe apuntar al directorio de activos en el host. En Orivia es `/home/admin/spaceapps2/data/nisar`; el contenedor `processor` lo monta en solo lectura en esa misma ruta. El catálogo expone un `storage_key` relativo junto con la variable, banda, fechas, huella y SHA-256. Este montaje habilita trabajos de procesamiento, pero no convierte automáticamente interferogramas GUNW en observaciones LOS.

El entrenamiento supervisado U-Net se ejecuta bajo el perfil `training` y escribe `best.onnx` en `models/nisar-change/`; requiere una colección de parches etiquetados. El modelo compuesto exploratorio se entrena con `python ml/nisar_change/train_composite.py` y escribe `composite_model.json` en el mismo directorio. El predictor monta ambos artefactos en solo lectura. `/health` comprueba el modelo compuesto; `/api/v1/analysis` expone el análisis combinado, mientras que `/api/v1/predictions` depende del U-Net supervisado.

### Límites de recursos para Orivia

Orivia tiene 2 vCPU y 2 GiB RAM. Compose limita los servicios permanentes a un máximo combinado de 1.25 CPU y 1,472 MiB de memoria, dejando capacidad para Debian, Caddy y Docker. El predictor y la API también limitan sus hilos. `trainer`, `processor` y las migraciones tienen límites propios; el auto-deploy omite una reconstrucción cuando la memoria libre es menor a 900 MiB o la carga de un minuto supera 1.25. No ejecutes entrenamiento o procesamiento pesado en producción. Estos límites reducen los picos, pero no evitan caídas causadas por falta de crédito de CPU en Lightsail: para eso conviene compilar fuera del servidor o subir el plan.

## Estado esperado

```sh
docker compose -f infra/saros/docker-compose.yml ps
```

Frontend, API y PostgreSQL deben estar saludables. El predictor requiere `models/nisar-change/composite_model.json`; el endpoint U-Net legado sigue no disponible hasta que exista `best.onnx`. `/ready` informa la disponibilidad de PostgreSQL y del predictor compuesto.

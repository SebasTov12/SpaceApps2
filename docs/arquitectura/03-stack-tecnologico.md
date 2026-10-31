# 03. Stack tecnológico

## Stack del repositorio Orivia

| Capa | Referencia real | Uso propuesto |
|---|---|---|
| UI | Next.js 16.4, React 19.3, TypeScript 5 | Mapa, landing y paneles |
| Estilos y UI | Tailwind CSS 4, clsx, tailwind-merge, Lucide React, Framer Motion | Componentes y visualización |
| Runtime frontend | Node 22 Alpine, Next standalone | Servir aplicación |
| API | Python 3.12, Flask 3, blueprints y factory | Servicios geoespaciales |
| Servidor | Gunicorn 23 | Ejecutar Flask |
| Persistencia | PostgreSQL 16, psycopg 3, repositorios y migraciones | Agregar esquema geoespacial |
| Identidad | PyJWT 2, bcrypt 4, access y refresh tokens | Proteger paneles |
| IA | Ollama Cloud configurable con fallback local | Explicar datos estructurados |
| Blockchain | web3.py 7, adaptador EVM opcional | Anclar hashes, no datos |
| Infraestructura | Docker Compose, Caddy 2 | Orquestar servicios y TLS |

## Dependencias revisadas

Frontend: Next, React, TypeScript, Tailwind CSS 4 y sus plugins, ESLint, tsx, clsx, tailwind-merge, Lucide y Framer Motion.

Backend: Flask, PyJWT, bcrypt, Gunicorn, psycopg binary y web3.py. Desarrollo: pytest y Ruff. No asumir ORM; el proyecto usa repositorios y migraciones SQL.

## Extensiones nuevas de NISAR

Agregar PostGIS, worker geoespacial, bibliotecas científicas compatibles con el producto SAR elegido, almacenamiento de objetos, derivados COG/teselas y motor de rutas. GDAL, Rasterio, xarray y NumPy son opciones a validar por prototipo; no son stack ya instalado en Orivia.

## Despliegue

Compose de referencia ejecuta frontend, API, PostgreSQL y Caddy. La base no expone puerto público. Las imágenes aplican usuario no root y controles de escritura donde corresponde. Orivia documenta Lightsail con Debian 13 y administración Tailscale; confirmar antes de reutilizar esa infraestructura.


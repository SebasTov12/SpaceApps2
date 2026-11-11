# 03. Stack tecnológico

## Stack del repositorio Orivia

| Capa | Referencia real | Aplicación en el reto |
|---|---|---|
| Interfaz | Next.js 16.4, React 19.3, TypeScript 5 | Mapa, landing y paneles |
| UI | Tailwind CSS 4, clsx, tailwind-merge, Lucide React, Framer Motion | Sistema visual y componentes |
| Runtime web | Node 22 Alpine y Next standalone | Servir frontend |
| API | Python 3.12, Flask 3, blueprints y factory | API de análisis territorial |
| Servidor | Gunicorn 23 | Ejecutar Flask |
| Persistencia | PostgreSQL 16, psycopg 3, repositorios y migraciones SQL | Agregar PostGIS y esquema espacial |
| Autenticación | PyJWT 2, bcrypt 4, access/refresh tokens y permisos | Paneles y administración |
| IA | Ollama configurable con fallback local | Explicación basada en hechos |
| Integridad | web3.py 7, adaptador EVM opcional | Hashes de publicaciones |
| Infraestructura | Docker Compose, Caddy 2 | Servicios y HTTPS |

## Dependencias y límites

El frontend usa Next, React, TypeScript, Tailwind y plugins, ESLint, tsx, clsx, tailwind-merge, Lucide y Framer Motion. El backend usa Flask, PyJWT, bcrypt, Gunicorn, psycopg binary y web3.py; pytest y Ruff son de desarrollo. No se asume ORM.

## Extensiones para NISAR y análisis socioeconómico

Añadir PostGIS, workers geoespaciales, bibliotecas compatibles con productos SAR elegidos, almacenamiento de objetos, COG/teselas y fuentes socioeconómicas. GDAL, Rasterio, xarray y NumPy son opciones para prototipar y validar; no forman parte de las dependencias existentes de Orivia.

## Despliegue

Compose de referencia contiene frontend, API, PostgreSQL y Caddy. Orivia describe staging en Amazon Lightsail con Debian 13 y acceso administrativo por Tailscale. Reutilizar esa infraestructura para el reto requiere confirmar acceso y capacidad.


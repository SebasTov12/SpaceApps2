# 03. Stack tecnológico

## Stack del repositorio Orivia

| Capa | Referencia real | Aplicación en el reto |
|---|---|---|
| Interfaz | Next.js 16.4, React 19.3, TypeScript 5 | Mapa, landing y paneles |
| UI | Tailwind CSS 4, clsx, tailwind-merge, Lucide React, Framer Motion | Sistema visual y componentes |
| Visualización 3D | Three.js 0.187, React Three Fiber 9.8, Drei 10.7 | Tierra, atmósfera, satélite NISAR y trayectoria orbital en WebGL |
| Runtime web | Node 24 Alpine y Next standalone | Servir frontend |
| API | Python 3.12, Flask 3, blueprints y factory | API de análisis territorial |
| Servidor | Gunicorn 23 | Ejecutar Flask |
| Persistencia | PostgreSQL 16, psycopg 3, repositorios y migraciones SQL | Agregar PostGIS y esquema espacial |
| Autenticación | PyJWT 2, bcrypt 4, access/refresh tokens y permisos | Paneles y administración |
| IA | Ollama configurable con fallback local | Explicación basada en hechos |
| Integridad | web3.py 7, adaptador EVM opcional | Hashes de publicaciones |
| Infraestructura | Docker Compose, Caddy 2 | Servicios y HTTPS |

## Dependencias y límites

El frontend usa Next, React, TypeScript, Tailwind y plugins, ESLint, tsx, clsx, tailwind-merge, Lucide, Framer Motion, Three.js, React Three Fiber y Drei. `@types/three` aporta los tipos de desarrollo para TypeScript. Las versiones instaladas quedan declaradas en `frontend/package.json` y resueltas en `frontend/package-lock.json`.

La escena 3D se ejecutará en el navegador y se integrará como componentes React. Three.js realizará el renderizado WebGL, React Three Fiber conectará la escena con React y Drei facilitará la carga de texturas, cámaras y modelos glTF. La portada conservará un recurso visual alternativo mientras carga la escena o cuando WebGL no esté disponible.

El backend usa Flask, PyJWT, bcrypt, Gunicorn, psycopg binary y web3.py; pytest y Ruff son de desarrollo. No se asume ORM.

## Visualización 3D en el frontend del reto

| Dependencia | Versión instalada | Uso previsto |
|---|---|---|
| `three` | `0.187.0` | Renderizar la Tierra, la atmósfera y el satélite NISAR en una escena WebGL. |
| `@react-three/fiber` | `9.8.2` | Integrar la escena como componentes de React 19. |
| `@react-three/drei` | `10.7.9` | Incorporar utilidades de escena y cargar modelos glTF (`.glb` o `.gltf`). |
| `@types/three` | `0.187.0` | Proporcionar tipos de Three.js durante el desarrollo con TypeScript. |

La Tierra utilizará capas separadas para superficie, nubes y atmósfera. El satélite podrá cargarse como modelo `.glb` o `.gltf` y compartir la misma escena para representar profundidad, orientación y ocultamiento detrás del planeta. La trayectoria inicial será una representación visual de la misión hasta disponer de datos orbitales adecuados.

## Extensiones para NISAR y análisis socioeconómico

Añadir PostGIS, workers geoespaciales, bibliotecas compatibles con productos SAR elegidos, almacenamiento de objetos, COG/teselas y fuentes socioeconómicas. GDAL, Rasterio, xarray y NumPy son opciones para prototipar y validar; no forman parte de las dependencias existentes de Orivia.

## Despliegue

Compose de referencia contiene frontend, API, PostgreSQL y Caddy. Orivia describe staging en Amazon Lightsail con Debian 13 y acceso administrativo por Tailscale. Reutilizar esa infraestructura para el reto requiere confirmar acceso y capacidad.


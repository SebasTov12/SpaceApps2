# 03. Stack tecnológico

## Stack del repositorio Orivia

| Capa | Referencia real | Aplicación en el reto |
|---|---|---|
| Interfaz | Next.js 16.4, React 19.3, TypeScript 5 | Mapa, landing y paneles |
| UI | Tailwind CSS 4, clsx, tailwind-merge, Lucide React, Framer Motion | Sistema visual, componentes e internacionalización (i18n) |
| Visualización 3D | Three.js 0.187, React Three Fiber 9.8, Drei 10.7 | Tierra, atmósfera, satélite NISAR y trayectoria orbital en WebGL |
| Mapas y Geoespacial | MapLibre GL 6.16, Web Worker | Mapas interactivos vectoriales, visualización antes/después y capas raster de radar NISAR |
| Runtime web | Node 24 Alpine y Next standalone | Servir frontend |
| API | Python 3.12, Flask 3, blueprints y factory | API de análisis territorial |
| Servidor | Gunicorn 23 | Ejecutar Flask |
| Persistencia | PostgreSQL 16, psycopg 3, repositorios y migraciones SQL | Agregar PostGIS y esquema espacial |
| Autenticación | PyJWT 2, bcrypt 4, access/refresh tokens y permisos | Paneles y administración |
| IA | Ollama configurable con fallback local | Explicación basada en hechos |
| Integridad | web3.py 7, adaptador EVM opcional | Hashes de publicaciones |
| Infraestructura | Docker Compose, Caddy 2 | Servicios y HTTPS |

## Estado implementado en SpaceApps2

El código presente en el repositorio implementa la capa de frontend con: Next.js 16.4.6, React 19.3, TypeScript 5.9, Node.js 24.14 o superior, Tailwind CSS 4.3, Framer Motion 14, Lucide React, Three.js 0.187 (con React Three Fiber y Drei) y MapLibre GL 6.16. 

La aplicación integra la escena 3D orbital con el satélite NISAR, un explorador multilingüe (español/inglés) y un visor cartográfico interactivo que soporta comparativas visuales (antes/después) y visualización de productos satelitales (amplitud, coherencia e interferometría simulada o pregenerada). El backend Flask/PostgreSQL de la tabla anterior corresponde al stack de referencia de Orivia y permanece pendiente de conexión directa con APIs reales en este repositorio.

## Dependencias y límites

El frontend usa Next, React, TypeScript, Tailwind y plugins, ESLint, tsx, clsx, tailwind-merge, Lucide, Framer Motion, Three.js, React Three Fiber, Drei y MapLibre GL. `@types/three` aporta los tipos de desarrollo para TypeScript. Las versiones instaladas quedan declaradas en `frontend/package.json` y resueltas en `frontend/package-lock.json`.

La escena 3D se ejecuta en el navegador como componentes React mediante WebGL, conectando el modelo con React Three Fiber y utilidades de Drei. Para el visor cartográfico en 2D/2.5D, MapLibre GL gestiona la proyección cartográfica, teselas vectoriales de contexto y superposiciones de capas de teledetección mediante un Web Worker dedicado copiado a `public/maplibre-gl-worker.mjs` durante los scripts `predev` y `prebuild`.

El backend usa Flask, PyJWT, bcrypt, Gunicorn, psycopg binary y web3.py; pytest y Ruff son de desarrollo. No se asume ORM.

## Visualización 3D y Cartografía en el frontend del reto

| Dependencia | Versión instalada | Uso previsto |
|---|---|---|
| `three` | `0.187.0` | Renderizar la Tierra, la atmósfera y el satélite NISAR en una escena WebGL. |
| `@react-three/fiber` | `9.8.2` | Integrar la escena como componentes de React 19. |
| `@react-three/drei` | `10.7.9` | Incorporar utilidades de escena y cargar modelos glTF (`.glb` o `.gltf`). |
| `@types/three` | `0.187.0` | Proporcionar tipos de Three.js durante el desarrollo con TypeScript. |
| `maplibre-gl` | `6.16.0` | Mapa interactivo del explorador territorial, renderizado de capas raster de satélite, control de opacidad y comparación temporal antes/después. |

La Tierra utiliza capas separadas para superficie, nubes y atmósfera, complementada por la trayectoria orbital de NISAR. Por su parte, el visor MapLibre permite ubicar los sitios de validación del piloto en Colombia y en el mundo, contrastando imágenes de referencia óptica con productos interferométricos o de deformación.

## Extensiones para NISAR y análisis socioeconómico

Añadir PostGIS, workers geoespaciales, bibliotecas compatibles con productos SAR elegidos, almacenamiento de objetos, COG/teselas y fuentes socioeconómicas. GDAL, Rasterio, xarray y NumPy son opciones para prototipar y validar; no forman parte de las dependencias existentes de Orivia.

## Despliegue

Compose de referencia contiene frontend, API, PostgreSQL y Caddy. Orivia describe staging en Amazon Lightsail con Debian 13 y acceso administrativo por Tailscale. Reutilizar esa infraestructura para el reto requiere confirmar acceso y capacidad.


# SAROS

**Exploración geoespacial para comprender cambios del territorio y sus posibles afectaciones.**

SAROS integra registros públicos de afectaciones, productos de observación NASA–ISRO NISAR y contexto territorial en una aplicación web. El sistema permite explorar países y registros, revisar fuentes y periodos, consultar capas geoespaciales y acceder a análisis asociados a los insumos disponibles.

> SAROS es una herramienta de exploración y apoyo a la planificación. No reemplaza las alertas oficiales, la verificación de campo ni las decisiones de las autoridades.

## Aplicación

Sitio: [saros.tobaru.xyz](https://saros.tobaru.xyz)

La interfaz incluye globo 3D, buscador, navegación por país, registros de afectación enlazados a su ficha, mapa 2D/3D, capas, panel territorial, barra de novedades y el asistente SARU. Las funciones disponibles dependen de la cobertura, calidad y actualización de cada fuente.

## Datos integrados

- **Registros de afectaciones:** fuentes públicas UNGRD V1/V2, SGC, Corpocaldas, IGAC y alertas locales de Sevilla, normalizadas con procedencia, fechas, ubicación y campos de impacto cuando la fuente los reporta.
- **Catálogo NISAR:** consulta de productos ASF/CMR y almacenamiento de metadatos, activos, variables, rejillas, unidades y checksums.
- **Productos raster:** activos geoespaciales derivados de escenas y recortes disponibles en el flujo ASF/NASA Harmony. Una capa o metadato de catálogo no equivale por sí solo a una medición LOS validada.
- **Contexto territorial:** fuentes públicas agregadas a escala municipal o nacional, con periodo y cobertura definidos por cada conjunto.

El corte documentado de afectaciones contiene **13.470 registros normalizados** en seis fuentes. La consulta ASF/CMR del **14 de noviembre de 2026** encontró 84 granules que intersectaban el AOI aproximado de Neiva; el inventario asociado registra 227 COG derivados de 58 granules GUNW, GCOV y SME2. Son cifras de ese corte de ingesta, no contadores en vivo. La [documentación de ingesta](docs/datos/ingesta-datos-reales.md) describe su procedencia y alcance.

## Análisis y alcance científico

El servicio de análisis combina cribado estadístico de características GUNW con un estimador de consecuencias históricas reportadas. Sus resultados son exploratorios y expresan prioridad relativa de revisión; no son una probabilidad de desastre, una alerta ni una atribución causal. El pronóstico LOS requiere una serie temporal procesada, referencia estable, control de calidad y geometría compatible. La presencia de escenas en el catálogo no confirma que exista esa serie para cada lugar.

Los registros históricos representan lo publicado por sus fuentes y pueden usar coordenadas puntuales, geometrías o centroides. El panel conserva la procedencia y precisión conocida. SARU explica información del aplicativo; sus respuestas no sustituyen la interpretación de especialistas.

## Arquitectura

| Capa | Tecnología | Función |
| --- | --- | --- |
| Interfaz | Next.js 16, React 19, TypeScript, Three.js, React Three Fiber, MapLibre GL y Framer Motion | Globo, mapas, visualización 3D, búsqueda y paneles interactivos. |
| API | Flask y Gunicorn | Registros, catálogo, capas, territorios, análisis y asistente. |
| Persistencia | PostgreSQL | Registros normalizados, inventarios, metadatos, evaluaciones e historial del asistente. |
| Procesamiento | Python, ASF Search, NASA Harmony, h5py, Rasterio, PyProj y Shapely | Consulta, descarga, inspección, recorte e ingesta geoespacial. |
| Despliegue | Docker Compose, GitHub Actions, GHCR y Caddy | Servicios en contenedores, imágenes versionadas, dominio y HTTPS. |

## Inicio local

Requisitos: Docker y Docker Compose para el stack completo; Node.js `>=24.14 <25` para trabajar solo en el frontend.

```powershell
Copy-Item .env.example .env
```

Completa en `.env` las variables necesarias para los servicios que vayas a ejecutar. No compartas ni versionas secretos. Para iniciar los servicios configurados:

```sh
docker compose -f infra/saros/docker-compose.yml up -d --build
```

Para trabajar en el frontend:

```sh
cd frontend
npm ci
npm run dev
```

La aplicación local queda en `http://localhost:3000`. Las rutas de servidor del frontend usan `SAROS_INTERNAL_API_URL`; las consultas públicas del cliente pueden usar `NEXT_PUBLIC_SAROS_API`. Nunca pongas credenciales en variables `NEXT_PUBLIC_*`.

## Rutas principales de la API

- `GET /api/v1/hazards/points`: registros de afectaciones agrupados para el mapa.
- `GET /api/v1/headlines`: elementos recientes disponibles para la barra de novedades.
- `GET /api/v1/nisar/scenes`: catálogo de escenas y metadatos NISAR.
- `GET /api/v1/sites`, `/manifest`, `/timeseries` y `/availability`: inventario del explorador y disponibilidad por sitio.
- `GET /api/v1/territorial/municipalities` y `/agriculture`: contexto territorial cargado.
- `POST /api/v1/analysis`: análisis compuesto de características GUNW.
- `POST /api/v1/nisar/observations` y `POST /api/v1/nisar/forecasts/run`: ingesta de observaciones LOS con control de calidad y ejecución de pronóstico temporal.
- `POST /api/v1/assistant/chat`: contexto del asistente SARU.

La API completa, autenticación, esquemas y ejemplos están en [backend/README.md](backend/README.md).

## Documentación del repositorio

- [Índice de documentación](docs/README.md)
- [Entrega del proyecto](docs/proyecto/entrega.md)
- [Arquitectura y contratos](docs/arquitectura/)
- [Datos e ingesta](docs/datos/)
- [Métodos y modelos](docs/modelos/)
- [Guía del pipeline](pipeline/README.md)
- [Guía de scripts de ingesta](scripts/README.md)
- [Despliegue en Orivia](infra/saros/README.md)
- [Estado del modelo NISAR](ml/nisar_change/README.md)
- [Inventario de evidencia](evidence/README.md)

## Uso responsable

Revisa fuente, fecha, cobertura, madurez del producto, precisión de ubicación y método antes de interpretar una capa o una cifra. Los reportes históricos no describen necesariamente condiciones actuales. Las estimaciones requieren revisión técnica y territorial; las emergencias deben verificarse con las entidades oficiales.

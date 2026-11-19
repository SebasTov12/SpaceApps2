# SAROS — plataforma geoespacial de análisis y prevención

## Resumen

SAROS integra registros públicos de afectaciones, datos territoriales y productos de observación NASA–ISRO NISAR en una experiencia web interactiva. Permite explorar ubicaciones, revisar fuentes y fechas, consultar mapas, observar contexto territorial y acceder a análisis asociados a la información disponible.

La plataforma está orientada a apoyar la exploración y la planificación preventiva. No sustituye los sistemas oficiales de alerta, las inspecciones de campo ni la evaluación de las entidades responsables.

## Funcionalidades

- Globo 3D con navegación por país y selección de registros geográficos.
- Búsqueda y filtros por ubicación y tipo de afectación.
- Barra de actualizaciones enlazada a los registros y vistas correspondientes.
- Ficha de ubicación con mapa 2D/3D, coordenadas, delimitación, fuente, fechas e impactos que constan en el registro.
- Panel territorial con contexto municipal cuando la fuente y el perfil están disponibles.
- Catálogo de escenas, pasadas y activos NISAR cargados en SAROS.
- Asistente SARU con narración sincronizada y chat en español e inglés.
- API para consulta de registros, catálogo, datos territoriales, ingesta de observaciones y análisis.

## Fuentes y cobertura

Los registros de afectaciones integrados proceden de UNGRD V1/V2, SGC, Corpocaldas, IGAC y alertas locales de Sevilla, Valle del Cauca. El corte de normalización documentado reúne 13.470 registros en seis fuentes.

La consulta ASF/CMR documentada el 14 de noviembre de 2026 encontró 84 granules que intersectan el AOI aproximado de Neiva. El proceso de recorte con NASA Harmony registró 227 COG derivados de 58 granules GUNW, GCOV y SME2. El catálogo puede ampliarse con nuevas consultas; las cifras corresponden al corte referido y no son un contador en vivo.

DANE, REPS, UPRA y otras fuentes públicas aportan información agregada para contexto territorial. Cada fuente conserva su cobertura, periodo y escala.

## Análisis y alcance científico

SAROS dispone de análisis exploratorio de características NISAR y registros históricos, un estimador de consecuencias reportadas y una ruta de pronóstico LOS basada en series verificadas. Un catálogo de escenas no es una medición de desplazamiento; las observaciones LOS requieren referencia estable, control de calidad y una serie temporal compatible.

Las prioridades del modelo son relativas y no expresan probabilidad de desastre. Las cifras de afectación describen reportes de las fuentes; no prueban causalidad con una señal satelital ni el estado actual de una vivienda.

## Arquitectura

- Frontend: Next.js, React, TypeScript, Three.js, React Three Fiber y MapLibre GL.
- API: Flask y Gunicorn.
- Base de datos: PostgreSQL.
- Procesamiento geoespacial: Python, ASF Search, NASA Harmony, Rasterio, h5py, PyProj y Shapely.
- Modelos: PyTorch y ONNX Runtime.
- Operación: Docker Compose, GitHub Actions, GHCR y proxy TLS Caddy.

La arquitectura, los contratos y las instrucciones de ejecución están en README.md y docs/README.md.

## Uso responsable

La precisión del mapa depende de la fuente original: una ubicación puede representar coordenadas del registro, un centroide de geometría o un centroide municipal. Los datos censales y agrícolas describen periodos agregados. Antes de tomar decisiones se deben revisar fecha, cobertura, fuente, método y limitaciones con especialistas y autoridades locales.

Sitio público: https://saros.tobaru.xyz

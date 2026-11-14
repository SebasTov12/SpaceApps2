# Tobaru Workteam — análisis socioeconómico de riesgo con NISAR

Plataforma geoespacial que combina observaciones NISAR con información territorial, demográfica y económica para identificar amenazas, analizar quién y qué actividad puede quedar expuesto, priorizar prevención y comunicar recomendaciones explicables.

## Arquitectura

- [Visión y alcance](docs/arquitectura/01-vision-y-alcance.md)
- [Arquitectura del sistema](docs/arquitectura/02-arquitectura-del-sistema.md)
- [Stack tecnológico](docs/arquitectura/03-stack-tecnologico.md)
- [Datos y procesamiento NISAR](docs/arquitectura/04-datos-y-procesamiento.md)
- [API y contratos](docs/arquitectura/05-api-y-contratos.md)
- [Experiencia y recomendaciones](docs/arquitectura/06-experiencia-y-recomendaciones.md)
- [Seguridad, privacidad y resiliencia](docs/arquitectura/07-seguridad-privacidad-y-resiliencia.md)
- [Despliegue y operación](docs/arquitectura/08-despliegue-y-operacion.md)
- [Decisiones](docs/arquitectura/09-decisiones-arquitectura.md)
- [Plan de implementación](docs/arquitectura/10-plan-de-implementacion.md)
- [Catálogo de datos](docs/arquitectura/11-catalogo-de-datos.md)

## Piloto

El prototipo se concentra en una región delimitada y una amenaza principal, preferiblemente deslizamientos si los productos y datos locales lo permiten. Conecta: datos NISAR → cambio del terreno → evaluación de amenaza → exposición social y económica → prioridad relativa → recomendación preventiva.

Las demás amenazas y sectores quedan como ampliaciones. Toda vista debe mostrar fuentes, fechas y limitaciones. No se publican probabilidades ni pérdidas monetarias como resultados reales sin modelos y datos que las respalden.

## Estado actual del repo

- **Frontend (Next.js):** recorrido 3D de la Tierra con NISAR y explorador con mapa real (MapLibre + imagen satelital). Muestra 5 sitios del mundo, uno por tipo de cambio: deslizamiento, subsidencia, inundación, flujo de glaciar y deforestación. Incluye vistas por fecha, antes/después y mapa de cambio, y la serie temporal de cualquier punto al hacer clic. Los sitios también aparecen como marcadores sobre el globo.
- **Pipeline (`pipeline/`):** `search_nisar.py` busca y descarga productos NISAR de ASF DAAC con las credenciales de Earthdata del `.env`. `build_layers.py` convierte GUNW, GCOV y GOFF en las capas del explorador (`frontend/public/data`). Ver [pipeline/README.md](pipeline/README.md).
- **Datos:** las capas actuales son **sintéticas con formato NISAR** (`build_layers.py --demo`) y la interfaz las marca como demo. El paso siguiente es descargar escenas reales y ejecutar `build_layers.py --real`; el modo real aún no se ha probado con archivos de ASF.
- Pendiente: API/backend, `frontend/Dockerfile` (lo referencia `infra/tenua`; debe ejecutar `npm run build`, que copia el worker de MapLibre en `prebuild`) y la versión en inglés.

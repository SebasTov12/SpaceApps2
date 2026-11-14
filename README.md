# SAROS — análisis socioeconómico de riesgo con NISAR

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
- [Baseline de detección de cambios NISAR](ml/nisar_change/README.md)
- [API Flask de SAROS](backend/README.md)
- [Filtro de catálogo NISAR para América y Colombia](scripts/README.md)

## Piloto

El prototipo se concentra en una región delimitada y una amenaza principal, preferiblemente deslizamientos si los productos y datos locales lo permiten. Conecta: datos NISAR → cambio del terreno → evaluación de amenaza → exposición social y económica → prioridad relativa → recomendación preventiva.

Las demás amenazas y sectores quedan como ampliaciones. Toda vista debe mostrar fuentes, fechas y limitaciones. No se publican probabilidades ni pérdidas monetarias como resultados reales sin modelos y datos que las respalden.

## Estado actual del repo

- **Frontend (Next.js) — SAROS:** toda la app vive en el planeta 3D. Al cargar, NISAR hace un reconocimiento global que descubre 19 zonas de riesgo con relieve 3D; el satélite recorre el planeta en trayectos cruzados y su haz detecta zonas al pasar. Al tocar una zona, la cámara se acerca y se abre un panel con el mapa real (fecha, antes/después gradual y cambio), cifras, serie temporal del punto y escenas NISAR reales en ASF. Arriba hay un cintillo de titulares que baja con el scroll. ES/EN.
- **Pipeline (`pipeline/`):** `search_nisar.py` consulta el catálogo CMR de NASA sin credenciales (y descarga con Earthdata). `build_layers.py` convierte GUNW, GCOV y GOFF en las capas del explorador. Ver [pipeline/README.md](pipeline/README.md).
- **Datos:** hay escenas NISAR reales en ASF para los 5 sitios (43 GUNW sobre el piloto de Colombia, ver [docs/entrega.md](docs/entrega.md)). Las capas del mapa siguen siendo **sintéticas con formato NISAR** y se marcan como demo. Siguiente paso: descargar y ejecutar `build_layers.py --real`.
- **Predicciones y LLM:** `pipeline/sql/` entrena regresiones lineales separadas sobre escenarios sintéticos DIAN + NISAR para Colombia y prepara una síntesis JSON para un LLM. Ver [modelo de síntesis](docs/modelo-sintesis-colombia.md).
- **Despliegue:** `infra/saros/docker-compose.yml` empaqueta el frontend SAROS, la API Flask, PostgreSQL y el predictor NISAR en un proyecto Compose. Caddy se mantiene como proxy compartido de Orivia.
- **Entrega:** resumen ES/EN, datos de NASA usados y guion del video en [docs/entrega.md](docs/entrega.md).
- **Modelo exploratorio local:** baseline PyTorch de segmentación binaria entre pares NISAR; aún requiere patches etiquetados y validación. Ver [README del modelo](ml/nisar_change/README.md).
- **Backend:** `backend/app.py` expone salud, disponibilidad, titulares y predicciones autenticadas; persiste el resumen de cada predicción en PostgreSQL. El checkpoint ONNX debe entrenarse antes de que el predictor acepte inferencias.
- **Compose SAROS:** `infra/saros/docker-compose.yml` coordina web, API, PostgreSQL, predictor y perfiles opcionales de entrenamiento/procesamiento. La base persiste en el volumen Docker `spaceapps2_postgres_data`.

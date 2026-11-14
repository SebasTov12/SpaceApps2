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

El frontend Next.js ya incluye el recorrido visual, el explorador territorial y tarjetas de exposición social/económica con datos sintéticos marcados como demo. La ubicación operativa del piloto sigue pendiente. Aún no hay API/backend, pipeline de descarga/procesamiento NISAR ni capas reales conectadas; el catálogo de datos registra lo que falta preparar.


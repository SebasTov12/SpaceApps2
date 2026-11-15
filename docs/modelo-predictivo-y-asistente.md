# Pronóstico territorial y asistente SAROS

## Estado real

- El artefacto local `nisar-impact-composite-0.2.0` une una detección no supervisada de anomalías GUNW con una estimación jerárquica de afectaciones históricas UNGRD por municipio/departamento. La imagen en ejecución del servidor debe verificarse después del próximo reinicio. No estima causalidad ni probabilidad de desastre.
- La rama temporal NISAR existente es una tendencia robusta LOS frente a persistencia, implementada en `ml/nisar_forecast/forecast.py`. El backend la ejecuta con `POST /api/v1/nisar/forecasts/run` y guarda cada ejecución en `nisar.forecast_runs` y `nisar.forecasts`, solo cuando hay observaciones reales y validadas en `nisar.observations`.
- Las escenas y los COGs por sí solos no forman todavía esa serie. Para derivar observaciones hacen falta máscaras de calidad, coherencia, componentes conectados y una referencia estable; no se deben convertir anomalías o promedios de fase sin calibrar en milímetros LOS.
- El 15 de noviembre de 2026 se reentrenó la rama NISAR en CUDA con PyTorch 2.6.0+cu126 en una NVIDIA GeForce RTX 3050 de 6 GB: 264.684 píxeles válidos de dos tracks, con las dos últimas observaciones por track reservadas para diagnóstico temporal. El estimador histórico utilizó 3.315 reportes UNGRD y 1.273 reportes de 2025 para evaluación fuera de tiempo. La corrida no entrenó un predictor futuro de eventos: `data/filtered/manifest.parquet` y las etiquetas expertas no existen, así que no se entrenó el U-Net ni un modelo de impacto causal.

## Asistente con Groq

El backend compone el contexto desde registros almacenados: observaciones y pronósticos NISAR, registros históricos de afectaciones y el último análisis compuesto. Groq genera una explicación en lenguaje natural, no genera ni modifica el pronóstico. Cada respuesta guarda modelo, pregunta, respuesta y snapshot del contexto en `analysis.assistant_interactions`.

Configura en el `.env` privado:

```dotenv
GROQ_API_KEY=tu_clave_de_groq
GROQ_MODEL=openai/gpt-oss-20b
SAROS_ASSISTANT_TOKEN=secreto_compartido_entre_next_y_backend
```

`SAROS_ASSISTANT_TOKEN` solo se inyecta en los contenedores Next.js y backend; nunca se expone al navegador. El widget llama al proxy same-origin `/api/assistant`, que reenvía a `POST /api/v1/assistant/chat`. La migración `pipeline/sql/008_assistant_interactions.sql` crea el registro auditable.

## Qué falta para un pronóstico de movimiento defendible

1. Completar y verificar observaciones LOS multitemporales: geometría consistente, referencia estable, coherencia/máscaras aplicadas y calidad/procedencia por escena.
2. Medir error por horizontes con objetivos futuros no usados en ajuste, incluyendo persistencia como baseline. Mantener incertidumbre no calibrada como `null`; no afirmar fiabilidad si hay pocos blancos independientes.
3. Emparejar los episodios con impactos UNGRD y capas sectoriales georreferenciadas y fechadas (viviendas, agricultura, ganadería, minería, vías, bosque, salud, educación). DIAN nacional no es etiqueta de pérdida local ni demuestra causalidad.
4. Separar estimación de movimiento, exposición, vulnerabilidad e impacto condicionado; registrar features, fuentes, versiones, ventanas temporales, métricas y predicciones en PostgreSQL.
5. Entrenar redes en CUDA solo después de disponer de suficientes muestras etiquetadas y splits temporales/espaciales sin fuga. Para el conjunto actual, las estadísticas y la regresión robusta son baratas en CPU; moverlas a GPU no las vuelve más predictivas.

## Límite operativo

Prioridades, anomalías y tendencias actuales son exploratorias. No se deben presentar como alertas oficiales, hora/fecha precisa de un evento, causalidad sectorial, rutas seguras o instrucciones de evacuación. En una emergencia prevalecen los organismos y protocolos locales.

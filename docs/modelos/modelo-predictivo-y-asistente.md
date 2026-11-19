# Evaluación territorial y asistente SARU

## Evaluación compuesta

El análisis compuesto registrado en SAROS combina características de productos NISAR GUNW y contexto de afectaciones históricas de UNGRD. La rama NISAR estima una anomalía estadística relativa por geometría; la rama histórica estima consecuencias reportadas usando agrupación jerárquica municipal y departamental.

El artefacto de modelo se entrenó con características de dos tracks GUNW y reportes UNGRD de 2019–2022. Los reportes de 2025 se reservaron para evaluación temporal del estimador histórico. En esa evaluación se comparó el error absoluto y cuadrático con una línea base global. Las métricas describen estimación de consecuencias reportadas; no son exactitud de alerta, calibración de riesgo ni prueba de causalidad.

La API POST /api/v1/analysis acepta una matriz NPZ con dos canales ordenados: fase desenrollada en radianes y magnitud de coherencia. El resultado incluye fracción de anomalía, contexto histórico y prioridad relativa. Requiere token privado y la migración pipeline/sql/007_composite_model.sql.

## Pronóstico LOS

La tendencia temporal robusta de ml/nisar_forecast/forecast.py compara una tendencia con persistencia sobre observaciones LOS verificadas. POST /api/v1/nisar/forecasts/run conserva el backtest y la versión de procesamiento. El endpoint no genera un pronóstico si la serie no cumple los requisitos de procedencia y calidad.

El detector U-Net de ml/nisar_change es un componente separado. Su inferencia requiere pesos ONNX y parches co-registrados con clases revisadas. No debe confundirse con el análisis compuesto ni presentarse como pronóstico de eventos.

## Asistente SARU

El frontend envía el chat a POST /api/assistant. La ruta de Next.js reenvía la solicitud a POST /api/v1/assistant/chat en la red privada. Flask obtiene contexto de los registros, observaciones y análisis disponibles, llama al proveedor configurado mediante GROQ_API_KEY y guarda la interacción y el resumen de evidencia.

El modelo de lenguaje explica el contexto que recibe; no procesa imágenes satelitales, no valida datos y no crea resultados científicos. SARU debe comunicar incertidumbre y remitir emergencias a las autoridades correspondientes.

## Configuración

Configura SAROS_ASSISTANT_TOKEN, GROQ_API_KEY y GROQ_MODEL en el entorno privado del servidor. Aplica pipeline/sql/008_assistant_interactions.sql antes de habilitar el registro de interacciones. No publiques secretos en el frontend ni en variables NEXT_PUBLIC.

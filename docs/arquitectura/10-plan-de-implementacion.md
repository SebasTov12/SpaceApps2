# 10. Plan de implementación

## Fase 1: adaptar Orivia

Confirmar base de código y conservar Next.js/React/TypeScript con API Flask/Gunicorn. Añadir módulos para áreas, observaciones, riesgo, recomendaciones y rutas.

## Fase 2: datos espaciales

Agregar PostGIS, migraciones, almacenamiento de objetos y manifiestos. Definir contratos entre frontend, API y worker.

## Fase 3: NISAR

Elegir AOI y peligro, verificar productos disponibles y calendario. Crear ingesta reproducible y un análisis inicial validado por especialista.

## Fase 4: experiencia

Crear mapa temporal, evidencia, explicación de prioridad y panel analista en Next.js. Proteger publicación con JWT/roles.

## Fase 5: validar y operar

Evaluar falsas alarmas, omisiones y umbrales; añadir monitorización, backups, retiro de publicación y revisión humana. Probar rendimiento de workers.

## Fase 6: integraciones opcionales

Ollama para explicación estructurada. EVM solo para hashes si se justifica; ni IA ni blockchain son prerrequisito de riesgo.

## Bloqueadores

AOI y peligro, productos NISAR adecuados, especialista SAR, datos viales/refugios/cierres vigentes y coordinación con autoridad. Etiquetar cualquier dato simulado en la demo.


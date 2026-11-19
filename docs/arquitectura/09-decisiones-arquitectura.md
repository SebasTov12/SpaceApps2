# Decisiones de arquitectura

## Interfaz y servicios separados

Next.js entrega la experiencia web y mantiene rutas de servidor para solicitudes que necesitan acceso interno. Flask centraliza acceso a PostgreSQL, contratos versionados y comunicación con el predictor.

## Procedencia en cada etapa

La ingestión, procesamiento y análisis son pasos separados. Los metadatos de una escena no se tratan como un ráster procesado; una capa procesada no se convierte automáticamente en observación LOS validada; un resultado estadístico no se publica como alerta.

## Registros y evaluaciones

Los registros de amenazas y las salidas de modelo se representan como entidades distintas. El historial reportado no se mezcla con un análisis NISAR ni se interpreta como consecuencia de este sin una evaluación trazable.

## Datos geográficos

La API conserva el origen de coordenadas y utiliza perfiles municipales para resolver ubicaciones cuando la fuente carece de coordenadas puntuales. El frontend recibe la precisión como parte del registro.

## Despliegue

Los servicios persistentes, procesos pesados y redes externas se separan mediante Compose. Las migraciones se ejecutan bajo un perfil explícito para evitar cambios de esquema durante el arranque habitual.

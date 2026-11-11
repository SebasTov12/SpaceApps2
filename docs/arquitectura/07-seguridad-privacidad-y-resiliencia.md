# 07. Seguridad, privacidad y resiliencia

## Controles del stack de referencia

- Access JWT y refresh tokens rotables/revocables; permisos comprobados en Flask.
- Contraseñas con bcrypt.
- CORS por origen explícito y rate limit en login.
- Secretos en entorno privado, nunca en frontend o Git.
- PostgreSQL solo en red interna de Compose, API y web detrás de Caddy.
- Contenedores no root y filesystem restringido donde aplique.
- Logs sin tokens, datos de hogares, coordenadas precisas ni secretos.

## Privacidad de datos socioeconómicos

Preferir datos agregados por unidad territorial. Evitar mostrar ubicación de hogares individuales o negocios vulnerables. Aplicar mínimos de agregación definidos con custodios de los datos. Registrar licencias, restricciones y finalidades de uso.

## Calidad, sesgo y representación

Registrar año, cobertura y resolución de cada conjunto. La población omitida, informalidad económica y diferencias entre censos pueden sesgar prioridades. Exponer calidad y brechas; no ocultar ausencia bajo una puntuación promedio.

## Integridad

Versionar fuentes, transformaciones, método, parámetros, revisión y publicación. PostgreSQL conserva el estado operativo. EVM puede anclar hashes mínimos de publicaciones si se justifica; su indisponibilidad no bloquea el servicio.

## Resiliencia

Si una fuente falla o está vencida, señalarlo y recalcular solo si las reglas lo permiten. Ollama no disponible implica explicación estructurada sin generación. Sin evidencia suficiente, estado de evaluación incompleta. Mantener copias de seguridad y procedimiento de retiro de resultados erróneos.


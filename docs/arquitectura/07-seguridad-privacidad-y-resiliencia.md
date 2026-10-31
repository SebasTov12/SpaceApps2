# 07. Seguridad, privacidad y resiliencia

## Controles del stack de referencia

- Access JWT, refresh tokens rotativos y permisos en Flask.
- Hash de contraseña bcrypt.
- CORS explícito y rate limiting de login.
- Secretos en entorno privado, nunca en frontend ni Git.
- PostgreSQL solo en red privada del Compose.
- API/frontend detrás de Caddy.
- Contenedores no root, filesystem de solo lectura y no-new-privileges donde aplica.
- Staging Orivia documenta SSH administrativo por Tailscale; verificar antes de usarlo para el reto.
- No registrar tokens, contraseñas, claves ni ubicación precisa de usuarios.

## Privacidad

Permitir consulta pública sin ubicación precisa. Pedir consentimiento para geolocalización y evitar almacenar rutas personales. Separar datos públicos de exposición de información personal.

## Integridad

Versionar producto fuente, método, parámetros, revisión y fecha. Anclaje EVM opcional de hashes; Postgres conserva la operación. Un fallo de blockchain no impide consultar.

## Resiliencia

Si NISAR o fuente auxiliar falla, mostrar última fecha y degradar evaluación. Si Ollama falla, usar explicación estructurada determinista. Si falta evidencia, indicar evaluación no disponible. Raspberry Pi, SQLite y outbox son una extensión futura indicada por Orivia, no un componente MVP.


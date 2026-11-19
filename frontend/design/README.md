# Diseño frontend de SAROS

Esta guía reúne el propósito visual, las exploraciones de diseño y los recursos de referencia del frontend. Permite consultar en un solo lugar qué se exploró y dónde revisar cada maqueta o grabación. Las propuestas sirven como registro del proceso; la interfaz vigente está implementada en `frontend/src/` y sus recursos de ejecución en `frontend/public/`.

## Enfoque visual

SAROS presenta información geoespacial compleja mediante una experiencia de exploración inmersiva. El diseño combina el globo y los mapas interactivos con paneles de datos legibles, controles compactos y una identidad espacial basada en tonos oscuros, azul y morado cósmico. Las animaciones acompañan la navegación, la selección de registros y las explicaciones de SARU sin reemplazar la información del mapa.

La interfaz se adapta a escritorio, tablet y móvil. En pantallas grandes prioriza la exploración simultánea del mapa y los paneles; en móvil reorganiza controles y fichas para conservar el área de visualización y permitir interacción táctil.

## Evolución y exploraciones

Las maquetas documentan alternativas que se exploraron para la página inicial, las vistas de mapa y terreno, el panel de capas y la presentación de SARU. Los videos conservan recorridos y ejemplos de interacción que ayudaron a definir la experiencia. Son referencias de diseño: no todas las decisiones de esos prototipos forman parte de la versión actual.

Al revisar una propuesta, compárala con el código vigente antes de modificar la interfaz. Si se incorpora una decisión nueva, registra aquí qué se integró y el motivo del cambio para mantener juntas la intención y su evolución.

## Maquetas navegables

- [Rediseño de la página](proposals/rediseno/maquetas/rediseno-pagina.html), con imágenes locales en `proposals/rediseno/maquetas/assets/`.
- [Tres direcciones visuales](proposals/rediseno/maquetas/tres-direcciones.html), con las mismas imágenes locales.
- [Exploración del panel de capas](proposals/rediseno/panel-capas/index.html), con el archivo complementario `nisar-ruiz.js` en esa misma carpeta.

Las rutas de imágenes dentro de las maquetas son relativas para que puedan abrirse localmente.

## Muestras y grabaciones

Las muestras de audio están en `proposals/rediseno/media/audio/`. Los recorridos en video están en `proposals/rediseno/media/video/`; incluyen pruebas del panel de zona, vigilancia ambiental, chat, narración y alternativas de rediseño.

## Relación con el producto

El material de `frontend/design/` no se importa desde el frontend ni se publica en el sitio. Los componentes activos se encuentran en `frontend/src/`; los recursos servidos por la aplicación están en `frontend/public/`.

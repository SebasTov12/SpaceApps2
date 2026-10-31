# 02. Arquitectura del sistema

## Vista lógica

    Productos NISAR y contexto local
        -> ingesta programada y validación
        -> almacenamiento de originales y derivados
        -> procesamiento geoespacial y control de calidad
        -> PostGIS, COG y teselas versionadas
        -> API de lectura
        -> PWA: mapa, evidencia, acciones y rutas
        -> caché Service Worker e IndexedDB

    Analista / autoridad -> revisión -> aprobación de publicación

## Componentes

### Cliente PWA

Interfaz cartográfica, estado de datos, comparación temporal, explicación del riesgo, recomendaciones, rutas y fuentes. Conserva el paquete aprobado más reciente en IndexedDB. El Service Worker cachea shell, fuentes y datos versionados.

### API y catálogo

Servicio HTTP de lectura para el público. Publica conjuntos geoespaciales con versión y vigencia. La edición de AOI, reglas y publicación se limita a una consola interna autenticada.

### Ingesta

Consulta catálogo y disponibilidad NISAR para el AOI, registra metadatos y evita duplicados por identificador y checksum. Un fallo de descarga no elimina el último producto válido. Las credenciales viven solo en el servidor.

### Procesamiento

Validación -> recorte del AOI -> alineación -> cálculo de métrica SAR compatible -> máscara de calidad -> combinación contextual -> exportación versionada. El método depende del producto disponible, geometría, terreno y fenómeno.

### Almacenamiento

- PostgreSQL/PostGIS para geometrías, eventos, zonas, red y metadatos.
- Almacenamiento de objetos para fuentes y GeoTIFF optimizados para nube.
- Teselas vectoriales o ráster para visualización web.

## Flujo de decisión

1. Se genera una observación y una métrica con su calidad.
2. Se agregan factores locales con vigencia comprobada.
3. Reglas versionadas calculan nivel de atención, explicación e incertidumbre.
4. Durante el piloto, una persona autorizada revisa resultados de alto impacto.
5. El enrutador busca alternativas por red conocida, aplicando cierres y zonas excluidas.
6. La interfaz muestra prioridad y canal oficial configurado para la zona.

NISAR mide propiedades de retrodispersión y fase radar. La deformación requiere geometría y procesamiento adecuados. Un cambio observado no equivale por sí mismo a pronóstico de desastre; umbrales y modelos requieren calibración local y evaluación independiente.


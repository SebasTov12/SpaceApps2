# 03. Stack tecnológico

## Principio

Conservar el stack de Orivia en la experiencia: sitio web estático, JavaScript sin framework obligatorio, CSS nativo, PWA y Service Worker. El cómputo geoespacial se ejecuta en trabajos del servidor.

| Capa | Opción de referencia | Función |
|---|---|---|
| UI | HTML semántico, CSS, JavaScript ES modules | Accesibilidad y experiencia |
| Mapa | Leaflet detrás de un adaptador | Capas y rutas |
| PWA | Web App Manifest y Service Worker | Instalación y shell offline |
| Datos cliente | IndexedDB | Paquetes y preferencias |
| API | Python y FastAPI | Catálogo, riesgo, recomendaciones, rutas |
| Geoprocesamiento | Python, GDAL, Rasterio, xarray, NumPy | Preparación de capas |
| SAR | Herramientas científicas compatibles con el producto y algoritmo elegido | Análisis reproducible |
| Base | PostgreSQL y PostGIS | Datos geoespaciales y metadatos |
| Ráster | Cloud Optimized GeoTIFF y almacenamiento de objetos | Distribución eficiente |
| API contract | OpenAPI 3 | Contratos versionados |
| Despliegue | Contenedores OCI para API y trabajos; hosting estático para PWA | Portabilidad |

## Compatibilidad con Orivia

El cliente se publica como sitio estático y abre desde URL o QR. La interfaz se organiza en módulos sin requerir una compilación compleja. El Service Worker mantiene caché versionada. Los paquetes de datos se publican por manifiesto y no se incrustan en código.

## Portabilidad y secretos

Versionar dependencias, contenedores, esquemas, reglas y formato de paquete. Ocultar proveedor de mapas, almacenamiento, rutas y ejecución de trabajos detrás de interfaces. No incluir claves o credenciales en frontend ni repositorio.

## Validaciones antes de fijar proveedor

- Rendimiento de COG y teselas en móviles de gama baja.
- Acceso automatizado, autenticación y cuotas de ASF/Earthdata.
- Método de deformación válido para producto y fenómeno piloto.
- Licencia y vigencia de red vial, refugios, límites y cierres.


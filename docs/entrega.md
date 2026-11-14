# Entrega NASA Space Apps — reto NISAR

## Resumen (ES)

Aplicación web interactiva que usa datos de radar de la misión NASA-ISRO NISAR para **seguir y visualizar cambios en la superficie** de cinco lugares del mundo:

| Sitio | Cambio | Producto NISAR | Qué se ve |
|---|---|---|---|
| Norte de Santander, Colombia (piloto) | Deslizamiento | L2 GUNW | Desplazamiento acumulado en línea de vista (mm) |
| Ciudad de México | Subsidencia | L2 GUNW | Hundimiento acumulado (cm) |
| Sylhet, Bangladés | Inundación | L2 GCOV | Retrodispersión HH (dB): el agua aparece oscura |
| Sermeq Kujalleq, Groenlandia | Flujo de glaciar | L2 GOFF | Velocidad del hielo (m/día) |
| Rondônia, Brasil | Deforestación | L2 GCOV | Retrodispersión HV (dB): cae al talar el bosque |

En la app se puede:
- Girar la Tierra 3D con NISAR en órbita y abrir cada sitio desde su marcador.
- Recorrer las adquisiciones cada 12 días, comparar **antes/después** con un deslizador y ver el **mapa de cambio**.
- Hacer clic en cualquier punto para ver su **serie temporal**.
- Leer en lenguaje simple **qué ve el radar** en cada caso.
- Cambiar entre español e inglés.

## Summary (EN)

An interactive web app that uses NASA-ISRO NISAR radar data to **track and visualize surface change** at five places around the world: a landslide in Colombia, subsidence in Mexico City, flooding in Bangladesh, glacier flow in Greenland and deforestation in Brazil. Users can spin a 3D Earth, open each site, step through 12-day acquisitions, compare before/after with a swipe, view a change map, click any point to see its time series and read a plain-language explanation of what the radar measures. Available in Spanish and English.

## Datos y recursos de NASA usados

| Recurso | Identificador | Uso |
|---|---|---|
| NISAR L2 Geocoded Unwrapped Interferogram (GUNW) | `NISAR_L2_GUNW_PROVISIONAL_V1` (C2854335566-ASF), `NISAR_L2_GUNW_V1` (C3622247503-ASF) | Deformación: deslizamiento y subsidencia |
| NISAR L2 Geocoded Polarimetric Covariance (GCOV) | `NISAR_L2_GCOV_PROVISIONAL_V1` (C2854338529-ASF), `NISAR_L2_GCOV_V1` (C3622241360-ASF) | Inundación y deforestación |
| NISAR L2 Geocoded Pixel Offsets (GOFF) | `NISAR_L2_GOFF_PROVISIONAL_V1` (C2854341702-ASF), `NISAR_L2_GOFF_V1` (C3622250865-ASF) | Velocidad del glaciar |
| ASF DAAC / NASA Earthdata | Catálogo CMR y Earthdata Login | Búsqueda y descarga (`pipeline/search_nisar.py`) |
| Imagen de NISAR | NASA/JPL-Caltech | Modelo del satélite en la escena 3D |
| Textura de la Tierra | Blue Marble (verificar crédito exacto del archivo usado) | Globo 3D |

Otros recursos: imagen satelital de fondo de Esri World Imagery (atribución en el mapa), MapLibre GL, Next.js, three.js / React Three Fiber.

### Escenas NISAR disponibles por sitio

Consulta al catálogo CMR del 14 de noviembre de 2026 (`python pipeline/search_nisar.py`):

| Sitio | Producto | BETA | PROVISIONAL | VALIDATED |
|---|---|---|---|---|
| Colombia | GUNW | 0 | 43 (19 jun – 8 oct 2026) | 0 |
| Ciudad de México | GUNW | 12 | 67 (30 oct 2025 – 8 oct 2026) | 0 |
| Sylhet | GCOV | 0 | 39 (18 jun – 18 oct 2026) | 8 (21 oct – 11 nov 2026) |
| Groenlandia | GOFF | 23 | 52 (18 jun – 9 oct 2026) | 0 |
| Rondônia | GCOV | 5 | 50 (18 jun – 16 oct 2026) | 5 (23 – 28 oct 2026) |

## Estado y límites (decirlo en la presentación)

- **Las capas que muestra hoy el mapa son sintéticas con formato NISAR** y la interfaz las marca como "DEMO". Las escenas reales existen (tabla anterior). Para usarlas hay que descargarlas con una cuenta Earthdata y ejecutar `build_layers.py --real`, que todavía no se ha probado con archivos reales.
- Un cambio detectado no es una alerta ni predice un desastre. Las cifras requieren validación local.
- Las escenas PROVISIONAL y VALIDATED no se mezclan sin documentarlo.

## Guion para el video de demo (~30–60 s; confirmar la duración en las reglas)

1. **(0–5 s)** La Tierra 3D gira con NISAR en órbita. Voz: "La superficie de la Tierra cambia todo el tiempo, pero es difícil verlo".
2. **(5–12 s)** Clic en el marcador de Colombia: el explorador abre la ladera. "NISAR mide milímetros de movimiento con radar, de día, de noche y entre nubes".
3. **(12–22 s)** Mover la línea de tiempo, activar **antes/después** y arrastrar el deslizador. Clic en el punto rojo para que aparezca la serie temporal.
4. **(22–30 s)** Cambiar a Sylhet (el agua se retira) y a Groenlandia (el glaciar se frena). Mostrar el panel "¿Qué ve el radar?".
5. **(30–40 s)** Mostrar la tarjeta "En ASF DAAC: 43 escenas reales" y el botón ES/EN. Cierre: "Cinco tipos de cambio, un mismo satélite, explicados para todos".

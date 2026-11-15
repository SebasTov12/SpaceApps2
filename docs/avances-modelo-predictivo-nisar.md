# Avances del modelo predictivo NISAR en SAROS

Fecha de actualización: 14 de noviembre de 2026

## Verificación del repositorio

Se revisó la rama `main`, el estado local y el commit `57e9ff2` antes de editar.
La rama estaba limpia al inicio. El primer `fetch` fue denegado por permisos;
al repetirlo con acceso aprobado, `origin/main` confirmó `57e9ff2` sin cambios
entrantes. El checkout del servidor está limpio en `ebf616a`, cuatro commits
detrás de `origin/main`. Esta edición aún no se ha publicado ni desplegado.

El repositorio ya incluía búsquedas ASF/CMR, análisis de pares GUNW,
descargador HTTPS, backend/API y una U-Net para detección de cambios entre
pares. La U-Net no es el modelo de pronóstico temporal LOS. También contiene
semillas y entrenamientos sintéticos que se excluyen del flujo científico.

## Datos reales de Neiva

Se consultó ASF/CMR con `asf_search` 14.1.0. La consulta fue de metadatos,
sin descarga HDF5. Resultados de cajas aproximadas:

| AOI consultado | GUNW totales | PROVISIONAL | BETA | UR |
|---|---:|---:|---:|---:|
| Núcleo Neiva, -75.34,2.88,-75.24,2.98 | 19 | 18 | 0 | 1 |
| Huila amplio, -75.8,2.5,-74.8,3.4 | 50 | 34 | 11 | 5 |

El núcleo tiene dos stacks PROVISIONAL conectados con 9 pares y 10 fechas
cada uno entre junio y octubre de 2026. Ascendente 047/frame 003 y
descendente 083/frame 087, modo 2000 SH. El stack amplio añade otras dos
geometrías, pero no más fechas. Se seleccionó el descendente 083/087 para
primera inspección, sujeto a comparar coherencia, cobertura válida y señal
con el ascendente.

Un dry-run del descargador seleccionó dos pares descendentes consecutivos,
2026-06-19→2026-07-01 y 2026-07-01→2026-07-13, tamaño estimado 4.555 GB.
No se descargaron. El catálogo no prueba deformación local ni calidad de
desenvolvimiento. La caja es aproximada y debe reemplazarse por el AOI oficial.

## Código añadido

- `data/aoi/neiva-core.geojson` configura el AOI de consulta y lo marca como
  aproximación pendiente de sustituir.
- `ml/nisar_forecast/forecast.py` lee un CSV de una serie real por AOI y
  stack, valida procedencia/calidad, ajusta tendencia lineal robusta y compara
  con persistencia en cortes temporales rodantes.
- `pipeline/sql/004_nisar_forecast.sql` define almacenamiento relacional de
  observaciones, ejecuciones y pronósticos, con claves únicas e invariantes
  que excluyen registros sintéticos.
- `docs/modelo-predictivo-nisar.md` describe objetivo, ecuación, contrato y
  límites. `scripts/README.md` incluye los comandos de consulta, dry-run y
  pronóstico.

La tendencia por zona es el primer modelo apropiado para la serie corta. Las
9–10 fechas solo permiten evaluación exploratoria con pocos cortes. No se
reportan métricas reales de pronóstico todavía. Para pronosticar se necesita
primero producir el CSV de desplazamiento LOS válido desde los pares GUNW.

## Pendiente para funcionar con mediciones

1. Habilitar acceso HTTPS Earthdata privado para descargar uno o dos HDF5 o
   COGs recortados Harmony. No existe `.env` local y no se guardarán secretos
   en el repositorio.
2. Inspeccionar la estructura real del HDF5 y descubrir rutas, rejillas,
   unidades, máscaras y atributos del granule seleccionado.
3. Procesar coherencia, componentes, referencia estable y la red de pares.
   El desplazamiento se conserva como LOS relativo y los faltantes no se
   reemplazan por cero.
4. Generar el CSV exigido por el pronosticador, correr backtest, reportar
   MAE/RMSE y decidir si hay soporte para el horizonte elegido.
5. Aplicar la migración SQL al entorno SAROS con autorización y conectar la
   escritura idempotente de observaciones/resultados.
6. Evaluar IDEAM, SGC, DEM y validación independiente de Neiva. Las alertas
   municipales de deslizamiento son contexto, no etiquetas LOS confirmadas.

Los HDF5, datos de campo y capas grandes se almacenarán fuera de Git. El
repositorio debe contener código, AOI versionado, contratos, manifiestos
livianos y documentación de procedencia.

## Integración para el servidor (iteración actual)

- La API Flask incluye rutas protegidas por el token SAROS para insertar
  observaciones LOS reales con procedencia y ejecutar/guardar el backtest en
  PostgreSQL. Las inserciones repetidas por versión son idempotentes.
- El contenedor de API incluye el paquete del modelo de tendencia. Compose
  tiene un perfil `migration` para aplicar el esquema NISAR explícitamente,
  sin tocar el volumen PostgreSQL durante el arranque normal.
- Se añadió `scripts/inspect_nisar_hdf5.py`, que lista rutas, dimensiones,
  tipos y atributos sin cargar matrices ráster. Los candidatos por nombre no
  sustituyen la validación científica de cada variable.
- La salida del modelo permanece `forecast_exploratory`. El error se expresa
  en mm; seis orígenes solo son un mínimo de cribado y exigen validación
  externa. Aún no hay serie LOS procesada ni métricas reales.
- El servidor `orivia` tiene SAROS API y frontend saludables, PostgreSQL
  ejecutándose y predictor NISAR en estado `unhealthy`. Aún no se ha aplicado
  esta edición ni se han descargado HDF5. La siguiente mejora científica
  depende de inspeccionar el HDF5 real, producir
  observaciones trazables y validarlas contra persistencia en cortes
  temporales. Las salidas de demostración y semillas sintéticas siguen fuera
  del entrenamiento/almacenamiento científico.

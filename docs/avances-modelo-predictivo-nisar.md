# Avances del modelo predictivo NISAR en SAROS

Fecha de actualización: 14 de noviembre de 2026

## Verificación del repositorio

Se revisó la rama `main`, el estado local y el commit `57e9ff2` antes de editar.
La rama estaba limpia al inicio. El primer `fetch` fue denegado por permisos;
al repetirlo con acceso aprobado, `origin/main` confirmó `57e9ff2` sin cambios
entrantes. El checkout del servidor estaba limpio en `ebf616a`, cuatro commits
detrás de `origin/main`; se actualizó por fast-forward a `426b2c8`. La edición
actual del informe aún requiere publicarse.

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

1. Habilitar `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` en el `.env` privado
   del servidor: ambos campos están vacíos actualmente. No compartir ni
   versionar esos secretos.
2. Inspeccionar la estructura real del HDF5 y descubrir rutas, rejillas,
   unidades, máscaras y atributos del granule seleccionado.
3. Procesar coherencia, componentes, referencia estable y la red de pares.
   El desplazamiento se conserva como LOS relativo y los faltantes no se
   reemplazan por cero.
4. Generar el CSV exigido por el pronosticador, correr backtest, reportar
   MAE/RMSE y decidir si hay soporte para el horizonte elegido.
5. Conectar el procesador científico para escribir observaciones idempotentes
   por la API protegida; la migración SQL ya está aplicada en el servidor.
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
  ejecutándose y predictor NISAR en estado `unhealthy`. Se aplicó la migración
  NISAR directamente al PostgreSQL existente (Compose intentó crear un
  contenedor duplicado por tratarse de un contenedor previo sin etiquetas); no
  se recreó la base ni se tocó su volumen. Se verificaron las tablas
  `observations`, `forecast_runs` y `forecasts`; las tres tienen cero filas.
- Se reconstruyó solo `spaceapps2-api`; Docker la reporta `healthy`. Frontend
  y PostgreSQL siguieron activos. El predictor ONNX existente continúa
  `unhealthy` y requiere un artefacto de modelo aparte; esto no bloquea las
  nuevas rutas del modelo temporal LOS.
- Las variables de Earthdata están vacías en el `.env` del servidor y no hay
  archivos `.h5`/`.hdf5` en `pipeline/data`. La siguiente
  mejora científica depende de inspeccionar el HDF5 real, producir
  observaciones trazables y validarlas contra persistencia en cortes
  temporales. Las salidas de demostración y semillas sintéticas siguen fuera
  del entrenamiento/almacenamiento científico.
- La prueba de consulta con `NISAR_DATA_MATURITY=VALIDATED` encontró que ASF
  `asf_search` no admite `dataMaturity` como argumento. Se corrigió el filtro
  para traducir la madurez al `shortName` documentado y retirar el argumento
  no admitido. La imagen del servidor usa `asf_search 10.3.0`; el requisito se
  acotó a `>=10,<11` y debe seguirse revisando contra el Cookbook ASF. La
  colección `NISAR_L2_GUNW_V1` devolvió 140 granules globales, 64 de América y
  ninguno en la caja núcleo. La consulta PROVISIONAL devolvió 18 granules: dos
  stacks de 9 pares, 10 fechas por stack y desde el 17/19 de junio al
  15/17 de octubre de 2026. El dry-run seleccionó dos pares D/083/087 de la
  CRID P05023 por 4.555 GB; no hubo transferencia.
- También se corrigió el modo `build_layers.py --real`: ya no cae a demo si
  faltan datos; ahora lee la ventana espacial del ráster, rechaza capas
  ambiguas o sin EPSG, separa configuraciones/CRID, valida cadenas GUNW y
  conserva píxeles faltantes. Aún no es un procesador científico para el
  pronosticador: faltan enmascaramiento por coherencia/componentes y una
  referencia estable, que deben verificarse sobre el HDF5 Neiva real.
- La búsqueda VALIDATED en la caja amplia del Huila también devolvió cero
  granules GUNW. Se amplió `download_nisar_colombia.py` para elegir madurez
  explícita y separar por CRID; por defecto conserva PROVISIONAL. El nuevo
  selector pasó el dry-run sobre el manifiesto real: dos pares D/083/087,
  PROVISIONAL/P05023, 4.555 GB, sin descarga.
- Se añadió `GET /api/v1/nisar/observations/checkpoint`, autenticado con el
  token SAROS, para consultar fecha más reciente, cantidad de observaciones y
  granules fuente para una combinación exacta de AOI, stack y versión.
- Se añadió `scripts/update_nisar_catalog.py`: toma ese checkpoint, consulta
  ASF desde la fecha inclusiva, mantiene la madurez seleccionada, filtra por
  stack y fecha secundaria, verifica la intersección geométrica con el AOI y
  fusiona metadatos nuevos en un GeoJSON mediante reemplazo atómico. No baja
  HDF5 ni fabrica observaciones. Si el checkpoint no existe, se detiene y pide
  la ingesta inicial real. La consulta real al servidor todavía no puede
  encontrar una serie porque la tabla tiene cero observaciones; credenciales
  Earthdata también siguen vacías y no hay HDF5 descargados.
- El cambio pasó `py_compile` y `git diff --check`, se publicó como `f82d64b`
  y se desplegó en `orivia`. La API responde saludable; una solicitud Bearer
  autenticada al checkpoint respondió `observation_count=0` y
  `last_processed_date=null`. El contenedor del procesador reconoce la CLI y
  su ejecución real se detuvo en ese checkpoint vacío, sin escribir archivos
  ni continuar a ASF. Así se comprobó la protección de la actualización, pero
  todavía no una consulta de productos posteriores. No se pueden reportar
  RMSE/MAE de predicción hasta producir una serie LOS científica real.
- El checkout del servidor se avanzó a `8417ba6`, igual que `origin/main`,
  preservando un commit remoto concurrente de interfaz que se inspeccionó.
  Después se inició la reconstrucción de la imagen web para aplicar ese cambio;
  el proceso dejó de responder y el host pasó a ser inaccesible por SSH e
  ICMP. La API y el procesador estaban sanos antes de esa reconstrucción. El
  resultado del build web y la salud actual del host quedan pendientes de
  reconexión; no se afirma que el despliegue completo haya terminado.
- Se endureció el criterio de fiabilidad del backtest: ahora cuenta
  fechas objetivo distintas y expone cuántas veces se reutilizó cada una. Los
  orígenes que comparten una observación futura se reconocen como dependientes;
  seis fechas objetivo distintas siguen siendo solo una condición mínima de
  cribado. Se versionó el algoritmo como 1.1. Este ajuste aún no está
  desplegado en la API porque el host sigue sin aceptar SSH.
- La documentación técnica se precisó con la especificación ASF: la fase GUNW
  está en radianes, hay capas distintas de coherencia a 20/80 m, y correcciones
  externas no se aplican automáticamente. También se registran las limitaciones
  vigentes de fase/desenvolvimiento; no se debe construir una observación LOS
  con solo convertir y acumular la capa de fase.
- La mejora del backtest y estas precisiones quedaron publicadas en
  `origin/main` como `06d0dec`; el módulo pasó `py_compile` y `git diff
  --check`. No se usaron datos sintéticos ni se calcularon métricas del modelo.
  La última revisión de Tailscale muestra `orivia` offline. El checkout remoto
  y la API todavía no incorporan este commit; al recuperar conectividad habrá
  que actualizar la API y verificar su salud antes de seguir con datos.
- El modo `pipeline/build_layers.py --real` ahora rechaza productos GUNW porque
  el lector existente aún no aplica máscaras y referencia estable; así evita
  generar mapas de desplazamiento o tendencias con una medición no validada.
  La ruta de procesamiento científico sigue pendiente de implementar sobre
  HDF5 real inspeccionado.
- El catálogo actual tiene 10 fechas por stack. Para el horizonte de 24 días,
  cinco observaciones de entrenamiento y tolerancia de 8 días, la secuencia
  permite como máximo cuatro fechas objetivo distintas en el backtest. El
  piloto actual no puede alcanzar el cribado mínimo de seis; habrá que esperar
  adquisiciones posteriores y conservar solo las que pasen controles de
  calidad.

## Actualización tras recuperar Orivia (15 de noviembre de 2026)

- Tailscale/SSH volvió a estar disponible. El checkout limpio del servidor se
  actualizó por fast-forward a `e35dc1b`, coincidente con `origin/main`; se
  inspeccionaron los seis commits entrantes, todos de interfaz.
- Se reconstruyeron las imágenes `spaceapps2-api` y
  `spaceapps2-nisar-processor`. Solo se recreó la API; quedó `healthy`. El
  checkpoint autenticado continúa informando cero observaciones y ninguna
  fecha procesada. Dentro de la imagen API confirmé el filtro por seis fechas
  objetivo distintas y la versión 1.1 del pronosticador.
- La imagen del procesador se comprobó sin datos de entrada: su lector rechaza
  GUNW en el modo real hasta aplicar máscaras y referencia estable. PostgreSQL
  no se reinició ni se modificó; conteo de `nisar.observations` en modo real:
  cero.
- Las variables `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` continúan vacías
  en el `.env` privado; no hay HDF5 que inspeccionar. No se descargó ni generó
  ningún dato y todavía no hay RMSE/MAE reales.
- La web actual sigue saludable, pero usa una imagen de unas cinco horas que
  precede a los últimos cambios de interfaz. No la reconstruí en el host: en
  la verificación quedaba aproximadamente 1 GB de RAM disponible y el intento
  anterior de build pesado terminó con la desconexión de Orivia. Los cambios
  de interfaz sí están en el checkout sincronizado; el runtime web requiere
  una compilación con más memoria o un build externo.
- El contenedor separado `spaceapps2-model` del detector ONNX sigue
  `unhealthy`; no es el servicio de pronóstico temporal LOS, que corre dentro
  de la API saludable.
- En `7f8fb24` el pronosticador pasó a versión 1.2: las métricas principales
  ahora puntúan una vez cada adquisición objetivo distinta y el resultado
  conserva como diagnóstico separado los errores ponderados por origen. Se
  publicó y desplegó la nueva imagen de API; confirmé en el contenedor los
  campos de evaluación, versión 1.2 y salud `healthy`. El checkpoint sigue en
  cero porque no hay credenciales/datos reales; por tanto este despliegue
  corrige la evaluación, pero aún no aporta MAE/RMSE científicos.
- Repetí desde Orivia la consulta metadata-only con `asf_search 10.3.0` y el
  AOI núcleo exacto de Neiva. El catálogo devolvió 18 GUNW PROVISIONAL (9
  ascendentes y 9 descendentes, CRID P05023), cero VALIDATED y cero BETA. El
  par más reciente de ese stack sigue siendo 5–17 de octubre de 2026; no hay
  adquisición posterior utilizable de esas colecciones para Neiva en esta
  consulta. No se descargaron archivos.

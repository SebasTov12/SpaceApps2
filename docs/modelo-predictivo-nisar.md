# Modelo predictivo NISAR para SAROS

## Alcance

El módulo `ml/nisar_forecast` pronostica desplazamiento relativo LOS agregado para un AOI y un único stack geométrico. No clasifica deslizamientos, no estima probabilidad de desastre y no predice terremotos. La salida es independiente de la U-Net en `ml/nisar_change`, que detecta cambios entre pares de imágenes.

## AOI inicial y cobertura consultada

`data/aoi/neiva-core.geojson` guarda la caja usada para la primera consulta de metadatos. Es aproximada y debe sustituirse por un polígono oficial antes del análisis final.

Resultados ASF/CMR observados durante el inventario:

| AOI aproximado | Granules GUNW | Provisional | Beta | UR | Validated¹ |
|---|---:|---:|---:|---:|---:|
| Núcleo de Neiva | 19 | 18 | 0 | 1 | 0 |
| Caja amplia Huila | 50 | 34 | 11 | 5 | 0 |

¹ Consultas independientes del 14 de noviembre de 2026 para `NISAR_L2_GUNW_V1`.

El núcleo contiene dos stacks provisionales de 9 pares. Ascendente 047/frame 003 y descendente 083/frame 087, ambos modo 2000 SH. Cada uno conecta 10 fechas entre junio y octubre de 2026. Aún no hay rásteres procesados ni pronósticos calculados.

La consulta repetida desde el servidor con `asf_search 10.3.0` confirmó 18
granules de la colección `NISAR_L2_GUNW_PROVISIONAL_V1`: 9 ascendentes y 9
descendentes. Un dry-run del descargador selecciona los dos pares D/083/087
consecutivos del 19 de junio al 13 de julio de 2026, misma CRID P05023, por
4.555 GB decimales; no los descargó. Cada granule mide aproximadamente
2.278 GB. El encadenamiento incluye una brecha de 24 días entre 25 de julio y
18 de agosto, consistente con el hueco de adquisición oficial del 27 de julio
al 10 de agosto ([hueco de datos NISAR](https://nisar-docs.asf.alaska.edu/availability-overview/)).

Actualización del 14 de noviembre de 2026: desde el servidor se consultó por
`shortName=NISAR_L2_GUNW_V1`, la colección VALIDATED. CMR devolvió 140 granules
globales, 64 para América y cero que intersequen la caja núcleo de Neiva. El
catálogo oficial indica que VALIDATED se publicó el 6 de noviembre y cubre
adquisiciones desde el 21 de octubre; por ahora no prolonga la serie local de
Neiva. La misma colección devolvió cero productos en la caja amplia del Huila.
Los productos PROVISIONAL y VALIDATED usan diferentes CRID/procesamiento y
deben permanecer separados en la evaluación hasta que haya una estrategia
explícita de armonización ([disponibilidad y madurez NISAR](https://nisar-docs.asf.alaska.edu/availability-overview/),
[cambios de productos VALIDATED](https://hyp3-docs.asf.alaska.edu/nisar-docs/release-notes/)).

## Decisión del modelo

La primera comparación es persistencia frente a tendencia lineal robusta por zona. Se define `y(t)` como desplazamiento LOS relativo en mm desde una fecha ancla y una referencia estable:

```text
y(t) = beta0 + beta1 * dias_desde_primera_observacion + error
```

El estimador usa incertidumbre observacional como peso cuando existe y regresión iterativamente reponderada para limitar la influencia de residuos extremos. La evaluación usa orígenes temporales rodantes y fechas futuras con tolerancia configurable. Informa MAE, RMSE y sesgo para ambos comparadores. Con menos de dos orígenes evaluables devuelve `insufficient_backtest_origins` y estado exploratorio.

Las 9–10 fechas por stack permiten diagnóstico y una tendencia preliminar. No sustentan estacionalidad anual, LSTM ni generalización continental. El número de píxeles no aumenta la cantidad de fechas independientes.

## Contrato del CSV de observaciones

El archivo de entrada debe tener una fila por fecha y un único AOI/stack. No se rellena con datos de demostración.

| Campo | Significado |
|---|---|
| `date` | Fecha ISO de adquisición asociada al desplazamiento estimado |
| `los_mm` | Mediana LOS relativa en la zona objetivo |
| `valid_fraction` | Fracción de píxeles válidos usados en el resumen |
| `aoi_id` | Identificador del AOI |
| `stack_id` | Geometría, por ejemplo `D-083-087-2000-SH` |
| `data_mode` | Debe ser `real` |
| `granule_ids` | Identificadores ASF separados por punto y coma |
| `uncertainty_mm` | Opcional, incertidumbre de la observación en mm |

Antes de producirlo se verifican fase desenrollada, coherencia, máscara, componentes de desenvolvimiento, referencia estable y conectividad de pares. La serie acumulada debe reconstruirse desde el grafo de pares y conservar faltantes como faltantes. `NaN` no equivale a desplazamiento cero. Una sola órbita entrega LOS, no desplazamiento vertical puro.

## Ejecución

Desde la raíz del repositorio, cuando exista un CSV procesado de mediciones reales:

```sh
python -m ml.nisar_forecast.forecast \
  --observations data/processed/neiva/los_observations.csv \
  --output models/nisar-forecast/neiva/forecast.json \
  --horizon-days 24 \
  --tolerance-days 8
```

El módulo rechaza filas `data_mode` distintas de `real`, fechas repetidas, mezclas de AOI o stack, columnas ausentes y observaciones inválidas. El JSON conserva parámetros, cortes, procedencia, calidad y calibración del intervalo. No informa intervalos predictivos sin calibración.

## Persistencia en la base de datos SAROS

`pipeline/sql/004_nisar_forecast.sql` crea tablas idempotentes de observaciones, ejecuciones y pronósticos. Sus restricciones excluyen datos sintéticos. Los HDF5, COG y cubos Zarr van en almacenamiento de archivos u objetos. PostgreSQL conserva catálogo, referencias, IDs de entrada, calidad y métricas. La migración ya fue aplicada en el PostgreSQL SAROS del servidor; las tres tablas están vacías hasta recibir observaciones LOS verificadas.

La API del servidor incorpora `POST /api/v1/nisar/observations` para almacenar
observaciones reales de forma idempotente y
`POST /api/v1/nisar/forecasts/run` para ejecutar y guardar la tendencia y su
backtest temporal. Ambos requieren el token Bearer de SAROS. El segundo exige
un `processing_version` único y exacto para no mezclar series calculadas con
algoritmos diferentes. La migración ya se aplicó en el servidor. Para repetir
su creación idempotente en otro entorno:

```sh
docker compose -f infra/saros/docker-compose.yml --profile migration run --rm nisar-migrate
```

`GET /api/v1/nisar/observations/checkpoint` devuelve la fecha y procedencia
del último dato real para AOI/stack/versión. `scripts/update_nisar_catalog.py`
usa ese checkpoint para añadir al manifiesto los GUNW posteriores del mismo
stack y madurez; la fecha de consulta ASF es inclusiva y cada par se filtra por
su fecha secundaria. La actualización solo incorpora metadatos. Una serie sin
checkpoint real se rechaza y requiere completar primero la ingesta inicial.

El servidor marca las salidas como exploratorias incluso cuando hay más de un
corte de validación. Seis orígenes temporales son solo una regla mínima de
cribado; no equivalen a una demostración de fiabilidad. El error principal se
expresa en milímetros, porque el porcentaje de error se vuelve inestable si el
LOS real está cerca de cero.

Las semillas sintéticas de `pipeline/sql/002` y `pipeline/sql/003` no son entradas para el esquema científico `nisar`.

## Pendientes para completar el flujo

- Acceso Earthdata HTTPS autenticado para descargar pares. No se encontró un `.env` local de SAROS. Nunca versionar credenciales.
- Descargar con espacio suficiente o pedir COGs recortados vía Harmony, tras verificar que contengan las variables requeridas.
- Reemplazar la caja inicial por AOI oficial de Neiva y definir municipios cercanos según cobertura y fenómeno.
- Inspeccionar HDF5 real y descubrir rutas internas con `h5py`.
- Ejecutar `scripts/inspect_nisar_hdf5.py` sobre los archivos del servidor y
  confirmar cada variable contra sus atributos y la guía oficial GUNW.
- Confirmar referencia estable con GNSS, nivelación u otra evidencia local.
- Construir el procesador de pares GUNW reales que produzca el CSV descrito. El pronosticador está implementado, pero no puede evaluarse hasta generar esa serie validada.

## Fuentes

- [Guía ASF de GUNW](https://nisar-docs.asf.alaska.edu/gunw/)
- [Madurez y productos NISAR](https://nisar-docs.asf.alaska.edu/products-overview/)
- [Alertas de deslizamientos IDEAM](https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Alertas-de-Deslizamientos/m3en-ptx7)
- [Catálogo Nacional de Estaciones IDEAM](https://www.datos.gov.co/Ambiente-y-Desarrollo-Sostenible/Cat-logo-Nacional-de-Estaciones-del-IDEAM/hp9r-jxuu)

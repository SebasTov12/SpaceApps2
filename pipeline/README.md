# Pipeline de datos NISAR

Convierte productos NISAR en las capas que muestra el explorador (`frontend/public/data`).
El frontend no habla con ASF: solo lee los archivos estáticos que genera este pipeline.

## Sitios

`sites.json` define 5 lugares del mundo, cada uno con un tipo de cambio y su producto NISAR:

| Sitio | Cambio | Producto | Qué se mide |
|---|---|---|---|
| Ladera andina, Colombia (piloto) | Deslizamiento | L2 GUNW | Desplazamiento en línea de vista (mm) |
| Ciudad de México | Subsidencia | L2 GUNW | Desplazamiento en línea de vista (cm) |
| Sylhet, Bangladés | Inundación | L2 GCOV | Retrodispersión HH (dB) |
| Sermeq Kujalleq, Groenlandia | Flujo de glaciar | L2 GOFF | Velocidad del hielo (m/día) |
| Rondônia, Brasil | Deforestación | L2 GCOV | Retrodispersión HV (dB) |

## Uso

```sh
cd pipeline
python -m pip install -r requirements.txt

# 1. Datos de demostración (lo que hay ahora en el repo)
python build_layers.py --demo

# 2. ¿Qué escenas reales hay? (catálogo CMR, sin credenciales)
python search_nisar.py                             # escribe frontend/public/data/availability.json
python search_nisar.py --list-collections

# 3. Descargar y procesar (requiere EARTHDATA_USERNAME/PASSWORD en el .env)
python search_nisar.py --site cdmx-subsidencia --download --limit 8
python build_layers.py --real                      # sitios sin descargas siguen en demo
```

## Salida por sitio

- `<fecha>.png`: capa coloreada de cada adquisición.
- `change.png`: diferencia entre la primera y la última fecha.
- `timeseries.json`: rejilla de unos 40×40 valores por fecha, para el gráfico al hacer clic.
- `manifest.json`: fechas, leyenda, estadísticas y procedencia (`source.mode` = `demo` o `real`).

El explorador muestra el badge **Demo** o **NISAR** según `source.mode`.

## Estado y límites

- El modo demo genera campos sintéticos con la forma y las unidades de cada producto. No son mediciones.
- El modo real está escrito siguiendo la estructura de los productos L2 (datasets `unwrappedPhase`, `HHHH`/`HVHV`, `alongTrackOffset`/`slantRangeOffset`, con `xCoordinates`, `yCoordinates` y `projection`). **Aún no se ha probado con archivos reales**: hay que verificar las rutas con la especificación de ASF cuando se descarguen las primeras escenas.
- GUNW: el desplazamiento es `-fase × λ / 4π` con λ = 23.84 cm (banda L). Los pares consecutivos se suman para obtener el acumulado; esto asume pares secuenciales sin huecos.
- Colecciones: `NISAR_L2_<GUNW|GCOV|GOFF>_<BETA_V1|PROVISIONAL_V1|V1>`. Por defecto se descarga la madurez con más escenas (`--maturity` para forzarla).
- En modo real solo se usan escenas de la misma geometría (track, dirección y frame); el resto se descarta y se avisa.
- No mezclar madureces (BETA, PROVISIONAL, VALIDATED) sin documentarlo (ver `docs/arquitectura/04`).

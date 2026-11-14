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

## Predicciones sintéticas DIAN + NASA y síntesis para LLM

La primera carga usa escenarios sintéticos de recaudo nacional DIAN y desplazamiento LOS NISAR para Norte de Santander. No son datos oficiales ni observaciones satelitales. Se guardan en la base dedicada `spaceapps2`, en `dian.predictions` y `nasa.predictions`, con el origen y las limitaciones dentro de `payload`.

La migración agrega claves idempotentes y las tablas de análisis. `analysis.train_colombia_synthetic_models()` ajusta dos regresiones lineales por mínimos cuadrados, una para cada serie sintética, registra coeficientes y métricas (R² y MAE) y genera la predicción del siguiente mes. Después crea el paquete JSON de síntesis en `analysis.llm_briefs`. El ámbito DIAN del ejemplo es nacional y el de NISAR es el AOI, por lo que el paquete mantiene ambas señales separadas. No crea puntaje conjunto ni alerta.

Desde PowerShell en la raíz del repositorio, aplica la migración y carga seis meses sintéticos:

```powershell
Get-Content -Raw pipeline/sql/001_prediction_synthesis.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
Get-Content -Raw pipeline/sql/002_seed_colombia_synthetic.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
Get-Content -Raw pipeline/sql/003_train_synthetic_models.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
```

Consulta los paquetes listos para la integración LLM con:

```sql
SELECT analysis.refresh_colombia_llm_briefs();
SELECT source, sample_count, coefficients, metrics
FROM analysis.model_training_runs
WHERE case_id = 'colombia-ladera'
ORDER BY source;
SELECT jsonb_pretty(payload)
FROM analysis.llm_briefs
WHERE case_id = 'colombia-ladera'
ORDER BY period_start;
```

La investigación de campos, el método y las fuentes oficiales están en [modelo-sintesis-colombia](../docs/modelo-sintesis-colombia.md).

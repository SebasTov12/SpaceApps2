# Pipeline de datos NISAR

La ingesta real de las fuentes públicas, el catálogo ASF, los recortes NASA Harmony y el estado de entrenamiento están documentados en [docs/ingesta-datos-reales.md](../docs/ingesta-datos-reales.md).

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
python build_layers.py --real --site colombia-ladera # falla si no hay HDF5 reales para el sitio
```

## Salida por sitio

- `<fecha>.png`: capa coloreada de cada adquisición.
- `change.png`: diferencia entre la primera y la última fecha.
- `timeseries.json`: rejilla de unos 40×40 valores por fecha, para el gráfico al hacer clic.
- `manifest.json`: fechas, leyenda, estadísticas y procedencia (`source.mode` = `demo` o `real`).

El explorador muestra el badge **Demo** o **NISAR** según `source.mode`.

## Estado y límites

- El modo demo genera campos sintéticos con la forma y las unidades de cada producto. No son mediciones.
- El modo real exige HDF5 disponibles y nunca sustituye una descarga ausente por datos demo. La lectura del ráster toma solo la ventana espacial del AOI. Si el nombre del dataset no es único, o falta la proyección/coordenadas, falla y reporta el problema.
- La lectura de GUNW todavía no aplica la máscara de coherencia ni `connectedComponents`, y todavía no selecciona una referencia estable. Por eso sus capas sirven solo para inspección exploratoria; **no las uses aún para generar observaciones LOS del pronosticador**.
- GUNW: el desplazamiento es `-fase × λ / 4π` con λ = 23.84 cm (banda L). Los pares solo se acumulan si sus nombres prueban una cadena de adquisiciones consecutivas. Los píxeles inválidos continúan como `NaN`; no se convierten en desplazamiento cero.
- Colecciones: `NISAR_L2_<GUNW|GCOV|GOFF>_<BETA_V1|PROVISIONAL_V1|V1>`. Por defecto se descarga la madurez con más escenas (`--maturity` para forzarla).
- En modo real solo se usan escenas de la misma geometría (track, dirección y frame); el resto se descarta y se avisa.
- No mezclar madureces (BETA, PROVISIONAL, VALIDATED) sin documentarlo (ver `docs/arquitectura/04`).

## Predicciones DIAN reales y demostración sintética NISAR

La base conserva seis observaciones sintéticas por fuente y un pronóstico sintético por fuente solo como demostración del formato; todas llevan `synthetic=true`. No son datos oficiales ni observaciones satelitales.

La serie oficial mensual DIAN ya está en `dian.monthly_observations`: 321 periodos entre enero de 2000 y septiembre de 2026, recaudo total y columnas de tributos según el archivo oficial. Los importes se conservan en millones de pesos corrientes y los nueve meses de 2026 se marcan preliminares. El modelo por mes calendario genera el pronóstico de octubre de 2026 y se compara con un baseline estacional mediante 60 objetivos rodantes fuera de muestra. Es exploratorio, nominal y aún requiere validación externa.

La migración `pipeline/sql/005_dian_real_observations.sql` crea la tabla real. `scripts/import_dian_monthly.py` descarga y convierte el Excel oficial sin dependencias adicionales; `ml.dian_forecast.forecast` entrena y genera el SQL para guardar la ejecución y el pronóstico real en `analysis.model_training_runs` y `dian.predictions`.

NISAR sigue pendiente en modo real: el catálogo ofrece metadatos, pero `nisar.observations` tiene cero filas. En el servidor, las credenciales Earthdata están vacías; además, el procesador debe inspeccionar y validar máscaras, componentes y referencia estable antes de derivar LOS. Por eso `analysis.llm_briefs` todavía contiene únicamente paquetes de demostración sintética; no se crea un resumen conjunto con una señal NISAR inventada.

Para reproducir la extracción DIAN y generar un pronóstico local:

```powershell
python scripts/import_dian_monthly.py --output-csv data/processed/dian/monthly.csv
python -m ml.dian_forecast.forecast --observations data/processed/dian/monthly.csv --output-json artifacts/dian/forecast.json --output-sql artifacts/dian/store_forecast.sql
```

Desde PowerShell en la raíz del repositorio, aplica las migraciones y carga el conjunto sintético de demostración:

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

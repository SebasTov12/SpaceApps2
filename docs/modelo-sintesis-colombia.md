# Datos reales DIAN y síntesis DIAN–NISAR

## Estado confirmado al 15 de noviembre de 2026

La serie DIAN oficial se descargó e importó en `dian.monthly_observations`: 321 meses, de enero de 2000 a septiembre de 2026. El archivo informa millones de pesos corrientes, corte al 23 de octubre de 2026 y cifras preliminares para 2026. Se conservan las columnas tributarias tal como aparecen; los subtotales no deben sumarse otra vez con sus componentes.

El pronóstico DIAN real de octubre de 2026 está en `dian.predictions`, y su ajuste en `analysis.model_training_runs` con `synthetic=false`. El modelo usa doce regresiones log-lineales, una por mes calendario, entrenadas con la serie nominal real. En un backtest rodante de 60 objetivos mensuales (octubre de 2021–septiembre de 2026), obtuvo MAE de 2 345 646 millones COP y RMSE de 3 423 741 millones COP. El baseline de repetir el mismo mes del año anterior obtuvo MAE de 3 335 499 y RMSE de 4 208 986 millones COP. El modelo es exploratorio, no está ajustado por inflación y requiere validación externa.

El pronóstico puntual para octubre de 2026 es 19 604 462 millones COP; el valor comparable de octubre de 2025 fue 18 742 467 millones COP. No se calcula intervalo calibrado ni se interpretan estos valores como actividad económica municipal.

Las filas anteriores de escenarios sintéticos siguen en `dian.predictions` y `nasa.predictions`, marcadas `synthetic=true`, para demostrar el contrato de la base. Las siete filas de `analysis.llm_briefs` corresponden solo a pares sintéticos; aún no se envía ningún paquete a un proveedor LLM.

## Datos que conviene conservar

### DIAN

La DIAN publica series mensuales y anuales de recaudo por tipo de tributo y dirección seccional, además de agregados de declaraciones. La ingestión actual usa el total mensual nacional y conserva las columnas de tributos informadas en la hoja, el periodo, la unidad, la URL, el hash SHA-256 y la nota de actualización. Mantiene el alcance `national`; no es una medida del municipio de Neiva, de Huila ni del AOI satelital.

La fuente DIAN advierte que la información estadística individual se recopila con fines estadísticos y no puede reutilizarse para decisiones de fiscalización o vigilancia. Este modelo usa solo agregados públicos; la serie sintética NISAR queda separada y se identifica como demostración.

### NISAR GUNW

Para una predicción real conserva el ID del granulo, colección y madurez, fechas de adquisición de ambas escenas, identificador de referencia y secundaria, polarización, proyección, resolución de publicación, fase desenrollada en radianes, coherencia, máscaras de calidad, incertidumbre ionosférica, correcciones aplicadas y método usado para derivar desplazamiento LOS. La guía ASF describe GUNW como producto L2 geocodificado con capas de fase y coherencia, publicación de 80 m y pares HH o VV con revisita nominal de 12 días.

El catálogo ASF disponible para la caja núcleo de Neiva contiene 18 productos GUNW PROVISIONAL y un producto UR en la consulta del 14 de noviembre. Son metadatos, no mediciones procesadas. La tabla `nisar.observations` tiene cero observaciones reales: no hay HDF5 descargados ni serie LOS apta para entrenar. Earthdata requiere autenticación para descargar/abrir los productos; las variables `EARTHDATA_USERNAME` y `EARTHDATA_PASSWORD` están vacías en `/home/admin/spaceapps2/.env`.

Aunque se habilite la descarga, el procesador debe inspeccionar la estructura real, aplicar máscara de calidad y componentes conectados, y establecer una referencia espacial consistente antes de calcular LOS. Los pares GUNW no se pueden sumar como si fueran adquisiciones independientes. El modelo robusto de `ml/nisar_forecast/forecast.py` solo acepta CSV con `data_mode=real` y evidencia de calidad.

### Metadatos comunes

Cada fila conserva modelo y versión, `run_id`, clave idempotente, fecha de cálculo, origen sintético o real, ámbito geográfico, periodo, objetivo, valor, unidad, intervalo, variables de entrada, método, fuente, licencia o restricciones pertinentes y limitaciones conocidas. Los detalles específicos quedan en `payload` JSONB.

## Modelo de síntesis

`ml.dian_forecast.forecast` ajusta el modelo DIAN con observaciones oficiales y produce un SQL idempotente para guardar parámetros, métricas y pronóstico. `analysis.train_colombia_synthetic_models()` permanece solo para repetir la demostración sintética DIAN/NISAR. `analysis.synthesize_colombia_month(date)` no se debe usar como evidencia real hasta contar con una predicción NISAR derivada de observaciones LOS válidas.

DIAN sigue a nivel nacional. NISAR se referirá al AOI únicamente tras procesar productos reales. No se estima correlación entre recaudo y desplazamiento, no se crea puntaje de riesgo y no se genera alerta. Cuando exista una señal NISAR real, se podrá preparar un paquete LLM con ambas evidencias separadas y sus alcances explícitos.

## Carga y consulta

Ejecuta desde PowerShell en la raíz del repositorio:

```powershell
Get-Content -Raw pipeline/sql/001_prediction_synthesis.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
Get-Content -Raw pipeline/sql/002_seed_colombia_synthetic.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
Get-Content -Raw pipeline/sql/003_train_synthetic_models.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
```

Para obtener paquetes listos para integrar con un LLM:

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

## Fuentes oficiales

- [Estadísticas de recaudo DIAN](https://www.dian.gov.co/dian/cifras/Paginas/EstadisticasRecaudo.aspx)
- [Serie mensual oficial DIAN 2000–2026](https://www.dian.gov.co/dian/cifras/EstadisticasRecaudo/Recaudo-mensual-por-tipo-de-impuesto-2000-2026.zip)
- [Agregados estadísticos de tributos DIAN](https://www.dian.gov.co/dian/cifras/Paginas/TributosDIAN.aspx)
- [Guía ASF del producto GUNW](https://nisar-docs.asf.alaska.edu/gunw/)
- [Descarga NISAR con Earthaccess y Earthdata Login](https://nisar-docs.asf.alaska.edu/earthaccess/)
- [Catálogo geográfico DANE y códigos DIVIPOLA](https://geoportal.dane.gov.co/descargas/mmra/MMRA2023_Catalogo_Objetos.pdf)

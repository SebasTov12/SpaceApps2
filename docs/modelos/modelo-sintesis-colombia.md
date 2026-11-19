# Datos DIAN y análisis territorial de Colombia

## Serie oficial

La tabla dian.monthly_observations contiene una serie mensual DIAN de enero de 2000 a septiembre de 2026, según el corte documentado el 15 de noviembre de 2026. Los valores están en millones de pesos corrientes y conservan las columnas de tributos de la fuente. Las cifras de 2026 se identifican como preliminares en el origen.

Los subtotales y componentes tributarios no deben sumarse dos veces. La serie es nacional y no representa actividad económica de un municipio ni daño asociado a un evento geográfico.

## Pronóstico exploratorio

El modelo ml/dian_forecast/forecast.py ajusta doce regresiones log-lineales, una para cada mes calendario, y compara el pronóstico con repetir el mismo mes del año anterior. El backtest rodante documentado usa 60 objetivos mensuales entre octubre de 2021 y septiembre de 2026.

| Método | MAE documentado | RMSE documentado |
|---|---:|---:|
| Regresión por mes calendario | 2.345.646 millones COP | 3.423.741 millones COP |
| Mismo mes del año anterior | 3.335.499 millones COP | 4.208.986 millones COP |

Los valores son exploratorios, nominales y requieren validación independiente. El pronóstico puntual de octubre de 2026 fue 19.604.462 millones COP; octubre de 2025 registró 18.742.467 millones COP en la fuente comparable.

## Relación con NISAR

La integración de DIAN, registros de afectaciones, territorio y observaciones NISAR conserva cada fuente y su escala. Los datos tributarios nacionales no son etiquetas de impacto local. La síntesis territorial solo es interpretable cuando la serie NISAR tiene procesamiento LOS, periodo y cobertura compatibles con el contexto geográfico.

Las tablas de predicciones y los resultados de análisis mantienen el método, ejecución y periodo para facilitar trazabilidad. No se infiere causalidad entre movimientos del terreno y variaciones de recaudo.

## Carga y ejecución

La importación DIAN se realiza con scripts/import_dian_monthly.py. La migración pipeline/sql/005_dian_real_observations.sql define el almacenamiento de observaciones oficiales. El entrenamiento genera una salida JSON y SQL reproducible; consulta scripts/README.md y ml/dian_forecast/ para parámetros y dependencias.

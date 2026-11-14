# Síntesis de predicciones sintéticas para Colombia

## Alcance de esta primera versión

La base almacena seis meses de escenario sintético para dos fuentes. Los valores no se descargaron de DIAN ni de ASF y no representan recaudación, deformación ni riesgo reales. Los scripts se pueden ejecutar de nuevo sin duplicar filas.

El modelo actual es una síntesis determinista y explicable, no un modelo entrenado. Compara cada predicción con la base sintética del mes anterior, conserva por separado sus unidades y alcances, y deja un paquete JSON preparado para un LLM. No envía datos a un proveedor LLM porque aún no hay proveedor ni credenciales configurados.

## Datos que conviene conservar

### DIAN

La DIAN publica series mensuales y anuales de recaudo por tipo de tributo y dirección seccional, además de agregados de declaraciones. Para ingestión real registra el periodo, tipo de tributo, valor y moneda, nivel geográfico, código de seccional, fecha de publicación, fecha de corte, método de agregación y procedencia. Mantén explícito si el dato es nacional o seccional. Una seccional no se convierte automáticamente en un municipio o en el área piloto.

La fuente DIAN advierte que la información estadística individual se recopila con fines estadísticos y no puede reutilizarse para decisiones de fiscalización o vigilancia. Este modelo usa únicamente agregados y datos sintéticos.

### NISAR GUNW

Para una predicción real conserva el ID del granulo, colección y madurez, fechas de adquisición de ambas escenas, identificador de referencia y secundaria, polarización, proyección, resolución de publicación, fase desenrollada en radianes, coherencia, máscaras de calidad, incertidumbre ionosférica, correcciones aplicadas y método usado para derivar desplazamiento LOS. La guía ASF describe GUNW como producto L2 geocodificado con capas de fase y coherencia, publicación de 80 m y pares HH o VV con revisita nominal de 12 días.

El código DANE del departamento se guarda como texto. El código `54` corresponde a Norte de Santander. El piloto del repositorio aún no fija un municipio validado, así que el ejemplo solo vincula el AOI del sitio con el departamento.

### Metadatos comunes

Cada fila conserva modelo y versión, `run_id`, clave idempotente, fecha de cálculo, origen sintético o real, ámbito geográfico, periodo, objetivo, valor, unidad, intervalo, variables de entrada, método, fuente, licencia o restricciones pertinentes y limitaciones conocidas. Los detalles específicos quedan en `payload` JSONB.

## Modelo de síntesis

`analysis.synthesize_colombia_month(date)` devuelve evidencia DIAN y NISAR para el mismo mes, el cambio porcentual sintético de recaudo, el cambio firmado de LOS en milímetros, la diferencia entre sus escalas geográficas y las instrucciones del LLM.

DIAN se modela aquí a nivel nacional. NISAR corresponde al AOI de Norte de Santander. La función marca que sus escalas no son comparables, no estima una correlación, no genera un puntaje de riesgo y no produce una alerta. El resultado queda en `analysis.llm_briefs` para que una integración posterior lo recupere y lo envíe al proveedor elegido.

## Carga y consulta

Ejecuta desde PowerShell en la raíz del repositorio:

```powershell
Get-Content -Raw pipeline/sql/001_prediction_synthesis.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
Get-Content -Raw pipeline/sql/002_seed_colombia_synthetic.sql | ssh -i "$env:USERPROFILE\.ssh\id_ed25519" admin@100.104.169.58 "docker exec -i spaceapps2-postgres psql -v ON_ERROR_STOP=1 -U spaceapps2_admin -d spaceapps2"
```

Para obtener paquetes listos para integrar con un LLM:

```sql
SELECT analysis.refresh_colombia_llm_briefs();
SELECT jsonb_pretty(payload)
FROM analysis.llm_briefs
WHERE case_id = 'colombia-ladera'
ORDER BY period_start;
```

## Fuentes oficiales

- [Estadísticas de recaudo DIAN](https://www.dian.gov.co/dian/cifras/Paginas/EstadisticasRecaudo.aspx)
- [Agregados estadísticos de tributos DIAN](https://www.dian.gov.co/dian/cifras/Paginas/TributosDIAN.aspx)
- [Guía ASF del producto GUNW](https://nisar-docs.asf.alaska.edu/gunw/)
- [Catálogo geográfico DANE y códigos DIVIPOLA](https://geoportal.dane.gov.co/descargas/mmra/MMRA2023_Catalogo_Objetos.pdf)

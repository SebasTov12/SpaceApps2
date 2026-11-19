# Modelos de cambio y análisis NISAR

El servicio predictor reúne dos flujos distintos: el análisis compuesto exploratorio usado por SAROS y el detector U-Net de cambios, cuyo entrenamiento requiere parches revisados y una partición espacial/temporal rigurosa.

## Modelo compuesto

El artefacto `models/nisar-change/composite_model.json` contiene dos componentes:

1. Un cribado estadístico de anomalías por geometría orbital, ajustado con fase desenrollada GUNW y magnitud de coherencia.
2. Un estimador jerárquico de consecuencias históricas municipales, ajustado con reportes UNGRD de movimientos en masa de 2019–2022 y evaluado con reportes de 2025.

El análisis entrega fracción de píxeles atípicos, contexto de impactos históricos y prioridad relativa de revisión. No clasifica por sí mismo un evento, no estima una probabilidad de desastre y no atribuye causalidad entre una señal y un impacto. La rama NISAR no cuenta con etiquetas expertas asociadas a los píxeles.

Entrenamiento local:

```powershell
python ml/nisar_change/train_composite.py --device cuda
```

La opción `--device auto` selecciona CUDA cuando está disponible. El proceso escribe el artefacto y el informe de entrenamiento en `models/nisar-change/`. El estimador histórico es estadístico; CUDA se utiliza para el procesamiento de características raster.

## API de análisis compuesto

`POST /api/v1/analysis?track_id=047-A-003&municipality=NEIVA&department=HUILA` recibe el cuerpo `application/octet-stream` como NPZ. Debe incluir `features` con forma `[2, alto, ancho]`, en este orden: `[fase_desenvuelta_rad, coherencia]`. Las dos bandas deben corresponder a la misma escena, rejilla y geometría orbital.

Ejemplo para empaquetar el cuerpo:

```python
import numpy as np
np.savez_compressed("patch.npz", features=np.stack([phase_rad, coherence]))
```

La ruta requiere token Bearer y la migración `pipeline/sql/007_composite_model.sql`. El resultado se guarda en `analysis.composite_assessments` con sus parámetros y procedencia. La máscara es un cribado exploratorio, no una clasificación de deslizamientos.

## U-Net supervisada de cambio

El repositorio contiene la arquitectura y el entrenamiento de una U-Net para producir una máscara binaria de cambio entre dos parches co-registrados. El flujo necesita datos de entrada con etiquetas revisadas; la existencia del código no implica que haya un artefacto de inferencia listo para uso.

### Contrato de entrada

Cada fila del manifiesto CSV o Parquet debe referenciar un archivo `.npz` con:

- `before`: `float32` con forma `[canales, alto, ancho]`.
- `after`: misma forma, calibración y rejilla espacial que `before`.
- `label`: máscara binaria `[alto, ancho]`, donde `1` representa la clase de cambio definida para el conjunto.

Los valores deben ser finitos y comparables entre escenas. Se deben enmascarar píxeles inválidos, separar productos y madureces incompatibles y documentar el criterio de las etiquetas. El modelo no debe aprender sus etiquetas de sus propias salidas.

Columnas del manifiesto:

| Columna | Uso |
| --- | --- |
| `sample_id` | Identificador único del parche. |
| `sample_path` | Ruta al NPZ, absoluta o relativa al manifiesto. |
| `split` | `train`, `validation` o `test` opcional. |
| `spatial_group` | Bloque geográfico o AOI no solapado. |
| `temporal_group` | Periodo o pareja de adquisiciones. |

Con `ML_SPLIT_STRATEGY=spatiotemporal`, cada grupo espacial y temporal aparece en una sola partición, para limitar fugas entre muestras vecinas o fechas relacionadas. La evaluación de prueba se realiza después de elegir el checkpoint con validación.

### Ejecución con Compose

Configura `ML_MANIFEST`, canales y parámetros en el entorno privado. Prepara el manifiesto y los NPZ conforme al contrato, luego ejecuta desde la raíz:

```sh
docker compose -f infra/saros/docker-compose.yml --profile training build trainer
docker compose -f infra/saros/docker-compose.yml --profile training run --rm trainer
```

El entrenador escribe `best.pt`, `best.onnx`, `history.json` y métricas de prueba cuando hay una partición `test` en `models/nisar-change/`. ONNX Runtime utiliza `best.onnx` para inferencia CPU.

La ruta protegida `POST /api/v1/predictions` envía una entrada NPZ con `before` y `after`, ambos de forma `[canales, alto, ancho]`. Deben compartir calibración, rejilla y valores finitos; las dimensiones deben ser divisibles por 16. Los límites de tamaño los configuran `ML_MAX_REQUEST_BYTES` y `ML_MAX_PIXELS`.

## Servicio predictor y alcance

Compose ejecuta el predictor ONNX en una red privada. Su salud informa la disponibilidad del artefacto compuesto; el endpoint U-Net necesita `best.onnx`. Los puntajes se deben interpretar con su periodo, productos, controles de calidad y métricas; una evaluación exploratoria no constituye validación operativa ni una alerta.

Para el contrato de observaciones LOS y pronósticos, consulta [modelo predictivo NISAR](../../docs/modelos/modelo-predictivo-nisar.md). Para ejecución y recursos del servidor, consulta [despliegue SAROS](../../infra/saros/README.md).

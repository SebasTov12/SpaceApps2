# NISAR pairwise change model

This first training baseline is a supervised pixel-level change detector. It takes two co-registered, same-product NISAR patches, concatenates the earlier scene, later scene, and absolute per-channel difference, then predicts a binary change mask with a U-Net. It does not estimate landslide probability, predict an event, or calculate losses.

## Input contract

Prepare one compressed NumPy `.npz` patch per manifest row. Each patch contains:

- `before`: `float32` array shaped `[channels, height, width]`.
- `after`: same shape, channels, calibration, and spatial grid as `before`.
- `label`: binary `0`/`1` array shaped `[height, width]` (`1` means the target change class).

Values must be finite and consistently calibrated/normalized across patches. Keep product families and processing maturities separate; do not pair incompatible products or treat missing/low-quality pixels as unchanged. Mask invalid regions during preprocessing and exclude them from training patches for this baseline. Labels must come from a documented reference or expert-reviewed inventory, not from the model's own predictions.

Set `ML_INPUT_CHANNELS` to the number and order of bands in each patch. The example value `2` is only a starting configuration, not a claim about a selected NISAR product. Use patch dimensions large enough for four U-Net downsampling stages (for example, 64×64 or larger).

The manifest is Parquet or CSV with these columns:

| Column | Meaning |
| --- | --- |
| `sample_id` | Unique patch identifier. |
| `sample_path` | `.npz` path, absolute or relative to the manifest directory. |
| `split` | `train`, `validation`, or optional `test`. |
| `spatial_group` | Non-overlapping spatial block or AOI group. |
| `temporal_group` | Acquisition period/pair group. |

With `ML_SPLIT_STRATEGY=spatiotemporal`, neither a spatial group nor a temporal group may occur in more than one split. This guards against adjacent-patch and acquisition-pair leakage; prepare the split before training. A test split, when present, is evaluated only after selecting the best checkpoint using validation pixel F1.

## Run with Docker Compose

Create a local `.env` from `.env.example`, set the NISAR/data settings and model settings, prepare `data/filtered/manifest.parquet`, and run from the repository root:

```sh
docker compose -f infra/saros/docker-compose.yml --profile training build trainer
docker compose -f infra/saros/docker-compose.yml --profile training run --rm trainer
```

The training container mounts `data/` read-only and writes `best.pt`, `best.onnx`, `history.json`, and, when a test split exists, `test_metrics.json` under `models/nisar-change/`. The ONNX file is the portable CPU inference artifact.

## Inference service and Docker health

The inference container uses ONNX Runtime (without PyTorch) as the `predictor` service in `infra/saros/docker-compose.yml`. The API reaches it at `http://predictor:8001` on the private SAROS network. Docker marks it healthy only after a trained `best.onnx` is mounted and loaded. SAROS's frontend and API have separate healthchecks.

After training, deploy the SAROS stack from the repository root on Orivia:

```sh
docker compose -f infra/saros/docker-compose.yml up -d --build
```

The backend checks model readiness at `http://predictor:8001/health` and forwards authenticated requests to its `/predict` endpoint. The input contract is an `application/octet-stream` body containing an `.npz` with `before` and `after` float arrays shaped `[channels,height,width]`. Arrays must be co-registered, consistently calibrated/normalized, finite, and have dimensions divisible by 16. Input size and pixel count are bounded by `ML_MAX_REQUEST_BYTES` and `ML_MAX_PIXELS`.

There is currently no trained checkpoint or labeled patch dataset in the repository. Until the training workflow produces `models/nisar-change/best.onnx`, `/health` reports `model_missing` and `/predict` returns HTTP 503; this prevents the service from presenting random output as a real prediction. The predictor detects the target change class represented by the training labels; it does not inherently identify landslides or predict events.

## Limits of this baseline

The repository does not yet contain labeled patches or a validated change inventory. The trainer intentionally fails on absent or malformed inputs. Do not use resulting scores as operational alerts until a domain expert validates the data, labels, quality masks, split design, and error tradeoffs. This initial container is intended for CPU training; CUDA requires a compatible NVIDIA host/runtime and PyTorch CUDA image setup.

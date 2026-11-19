from __future__ import annotations

import io
import os
import unicodedata
from contextlib import asynccontextmanager
from pathlib import Path

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel

from composite import analyze_patch, impact_estimates, load_bundle

MODEL_PATH = Path(os.getenv("MODEL_PATH", "/models/nisar-change/best.onnx"))
COMPOSITE_MODEL_PATH = Path(os.getenv("COMPOSITE_MODEL_PATH", "/models/nisar-change/composite_model.json"))
THRESHOLD = float(os.getenv("ML_THRESHOLD", "0.5"))
MAX_REQUEST_BYTES = int(os.getenv("ML_MAX_REQUEST_BYTES", str(32 * 1024 * 1024)))
MAX_PIXELS = int(os.getenv("ML_MAX_PIXELS", "262144"))
session: ort.InferenceSession | None = None
input_channels: int | None = None
composite_bundle: dict[str, object] | None = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global session, input_channels, composite_bundle
    if MODEL_PATH.is_file():
        session = ort.InferenceSession(str(MODEL_PATH), providers=["CPUExecutionProvider"])
        input_channels = int(session.get_inputs()[0].shape[1])
    if COMPOSITE_MODEL_PATH.is_file():
        composite_bundle = load_bundle(COMPOSITE_MODEL_PATH)
    yield
    session = None
    composite_bundle = None


app = FastAPI(title="NISAR Change Inference", version="0.1.0", lifespan=lifespan)


def fold_admin_name(value: str) -> str:
    ascii_value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_value.upper().split())


class ContextRequest(BaseModel):
    locations: list[dict[str, str]]


@app.get("/health")
def health() -> dict[str, object]:
    if composite_bundle is None:
        raise HTTPException(status_code=503, detail={"status": "composite_model_missing", "path": str(COMPOSITE_MODEL_PATH)})
    return {
        "status": "ready",
        "composite_model_loaded": True,
        "legacy_supervised_unet_loaded": session is not None,
        "model_version": composite_bundle["model_version"],
        "supported_tracks": sorted(composite_bundle.get("nisar_anomaly", {}).get("tracks", {}).keys()),
    }


@app.post("/analyze")
async def analyze(request: Request) -> dict[str, object]:
    if composite_bundle is None:
        raise HTTPException(status_code=503, detail="Composite NISAR-impact model is not available")
    track_id = request.query_params.get("track_id", "")
    municipality = request.query_params.get("municipality", "")
    department = request.query_params.get("department", "")
    if not track_id or not municipality or not department:
        raise HTTPException(status_code=422, detail="track_id, municipality and department query parameters are required")
    if len(municipality) > 100 or len(department) > 100:
        raise HTTPException(status_code=422, detail="Administrative names exceed the allowed length")
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="NPZ request exceeds the configured size limit")
    chunks: list[bytes] = []
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)
        if total_bytes > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="NPZ request exceeds the configured size limit")
        chunks.append(chunk)
    try:
        with np.load(io.BytesIO(b"".join(chunks)), allow_pickle=False) as patch:
            features = np.asarray(patch["features"], dtype=np.float32)
    except (KeyError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Body must be a valid NPZ containing a features array") from exc
    if features.ndim != 3 or features.shape[0] != 2:
        raise HTTPException(status_code=422, detail="features must have shape [2,height,width] ordered as [phase,coherence]")
    _, height, width = features.shape
    if height < 16 or width < 16 or height * width > MAX_PIXELS:
        raise HTTPException(status_code=422, detail="Raster dimensions must be at least 16x16 and within the pixel limit")
    try:
        return analyze_patch(composite_bundle, features, track_id, municipality, department)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/context/batch")
def historical_context(body: ContextRequest) -> dict[str, object]:
    """Estimate municipal historical impact baselines, never current movement or future risk."""
    if composite_bundle is None:
        raise HTTPException(status_code=503, detail="Composite model is not available")
    if not body.locations or len(body.locations) > 250:
        raise HTTPException(status_code=422, detail="locations must contain between 1 and 250 items")
    results = []
    targets = composite_bundle["impact_model"]["targets"]
    for location in body.locations:
        municipality = location.get("municipality", "").strip()
        department = location.get("department", "").strip()
        if not municipality or not department or len(municipality) > 100 or len(department) > 100:
            continue
        dept_key, muni_key = fold_admin_name(department), fold_admin_name(municipality)
        coverage = {
            name: ("municipality" if f"{dept_key}|{muni_key}" in target.get("municipality", {})
                   else "department" if dept_key in target.get("department", {}) else "national")
            for name, target in targets.items() if name != "deaths"
        }
        if all(level == "national" for level in coverage.values()):
            continue
        estimates, percentile = impact_estimates(composite_bundle, municipality, department)
        estimates.pop("deaths", None)
        results.append({
            "municipality": municipality,
            "department": department,
            "model_version": composite_bundle["model_version"],
            "method": composite_bundle["impact_model"].get("method"),
            "training_period": composite_bundle.get("training_provenance", {}).get("impact_split"),
            "estimated_historical_impacts": estimates,
            "historical_impact_percentile": percentile,
            "estimate_geography": coverage,
            "data_mode": "real_historical_context",
            "interpretation": "Historical municipal baseline from reported impact data; not a current event assessment, causal attribution, probability, or forecast.",
        })
    return {"contexts": results}


@app.post("/predict")
async def predict(request: Request) -> dict[str, object]:
    if session is None or input_channels is None:
        raise HTTPException(status_code=503, detail="Trained ONNX model is not available")
    content_length = request.headers.get("content-length")
    if content_length and int(content_length) > MAX_REQUEST_BYTES:
        raise HTTPException(status_code=413, detail="NPZ request exceeds the configured size limit")
    chunks: list[bytes] = []
    total_bytes = 0
    async for chunk in request.stream():
        total_bytes += len(chunk)
        if total_bytes > MAX_REQUEST_BYTES:
            raise HTTPException(status_code=413, detail="NPZ request exceeds the configured size limit")
        chunks.append(chunk)
    body = b"".join(chunks)
    try:
        with np.load(io.BytesIO(body), allow_pickle=False) as patch:
            before = np.asarray(patch["before"], dtype=np.float32)
            after = np.asarray(patch["after"], dtype=np.float32)
    except (KeyError, ValueError, OSError) as exc:
        raise HTTPException(status_code=400, detail="Body must be a valid NPZ with before and after arrays") from exc

    if before.ndim != 3 or before.shape != after.shape or before.shape[0] != input_channels:
        raise HTTPException(
            status_code=422,
            detail=f"before/after must match [channels,height,width] with {input_channels} channels",
        )
    _, height, width = before.shape
    if height < 16 or width < 16 or height % 16 or width % 16 or height * width > MAX_PIXELS:
        raise HTTPException(status_code=422, detail="Patch dimensions must be multiples of 16 and within pixel limit")
    if not np.isfinite(before).all() or not np.isfinite(after).all():
        raise HTTPException(status_code=422, detail="Input arrays must contain only finite calibrated values")

    batch_before = before[None, ...]
    batch_after = after[None, ...]
    logits = session.run(["logits"], {"before": batch_before, "after": batch_after})[0][0, 0]
    probabilities = 1.0 / (1.0 + np.exp(-np.clip(logits, -80, 80)))
    mask = probabilities >= THRESHOLD
    return {
        "threshold": THRESHOLD,
        "height": height,
        "width": width,
        "changed_fraction": float(mask.mean()),
        "mask": mask.astype(np.uint8).tolist(),
        "probability": probabilities.astype(np.float32).tolist(),
    }

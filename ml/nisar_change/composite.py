"""CPU-only composite NISAR anomaly and historical impact model."""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path
from typing import Any

import numpy as np


def _normalize_admin(value: str) -> str:
    ascii_text = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")
    return " ".join(ascii_text.upper().split())


def load_bundle(path: Path) -> dict[str, Any]:
    bundle = json.loads(path.read_text(encoding="utf-8"))
    if bundle.get("schema_version") != "tobaru-composite-v1":
        raise ValueError("Unsupported composite model schema")
    if not bundle.get("nisar_anomaly", {}).get("tracks") or not bundle.get("impact_model", {}).get("targets"):
        raise ValueError("Composite model bundle is incomplete")
    return bundle


def robust_phase_standardize(phase: np.ndarray, valid: np.ndarray) -> np.ndarray:
    values = phase[valid]
    if not values.size:
        raise ValueError("The phase plane has no valid pixels")
    center = float(np.median(values))
    mad = float(np.median(np.abs(values - center)))
    scale = 1.4826 * mad
    if not np.isfinite(scale) or scale < 1e-6:
        q25, q75 = np.quantile(values, [0.25, 0.75])
        scale = float((q75 - q25) / 1.349)
    if not np.isfinite(scale) or scale < 1e-6:
        scale = 1.0
    return np.clip((phase.astype(np.float64) - center) / scale, -12.0, 12.0)


def impact_estimates(bundle: dict[str, Any], municipality: str, department: str) -> tuple[dict[str, float], float]:
    model = bundle["impact_model"]
    targets = model["targets"]
    estimates: dict[str, float] = {}
    for target, item in targets.items():
        normalized_department = _normalize_admin(department)
        normalized_municipality = _normalize_admin(municipality)
        by_municipality = item["municipality"].get(f"{normalized_department}|{normalized_municipality}")
        by_department = item["department"].get(normalized_department)
        estimate = by_municipality if by_municipality is not None else by_department
        if estimate is None:
            estimate = item["global_mean"]
        estimates[target] = max(0.0, float(estimate))
    family_count = estimates.get("affected_families", 0.0)
    reference = float(model.get("impact_reference_families_q95", 1.0))
    impact_percentile = 100.0 * min(1.0, np.log1p(family_count) / max(np.log1p(reference), 1e-6))
    return estimates, float(impact_percentile)


def analyze_patch(
    bundle: dict[str, Any],
    features: np.ndarray,
    track_id: str,
    municipality: str,
    department: str,
) -> dict[str, Any]:
    if features.ndim != 3 or features.shape[0] != 2:
        raise ValueError("features must have shape [2, height, width] ordered as [unwrapped_phase_rad, coherence]")
    phase = np.asarray(features[0], dtype=np.float64)
    coherence = np.asarray(features[1], dtype=np.float64)
    if phase.shape != coherence.shape or min(phase.shape) < 1:
        raise ValueError("NISAR feature planes must have matching, non-empty dimensions")
    valid = np.isfinite(phase) & np.isfinite(coherence) & (coherence >= 0.0) & (coherence <= 1.0)
    if valid.mean() < 0.05:
        raise ValueError("At least 5% of pixels must contain finite phase and 0..1 coherence")
    track = bundle["nisar_anomaly"]["tracks"].get(track_id)
    if track is None:
        raise ValueError(f"Unknown NISAR track_id: {track_id}")

    phase_z = robust_phase_standardize(phase, valid)
    vectors = np.column_stack((phase_z[valid], coherence[valid]))
    mean = np.asarray(track["mean"], dtype=np.float64)
    inverse_covariance = np.asarray(track["inverse_covariance"], dtype=np.float64)
    centered = vectors - mean
    distances = np.einsum("ij,jk,ik->i", centered, inverse_covariance, centered)
    pixel_threshold = float(track["pixel_distance_q99"])
    changed = distances >= pixel_threshold
    changed_fraction = float(changed.mean())
    reference_fraction = max(float(track["scene_changed_fraction_q95"]), 0.005)
    anomaly_index = float(100.0 * min(1.0, changed_fraction / reference_fraction))
    anomaly_mask = np.zeros(valid.shape, dtype=np.uint8)
    anomaly_mask[valid] = changed.astype(np.uint8)

    estimates, impact_percentile = impact_estimates(bundle, municipality, department)
    priority_score = float(np.sqrt(anomaly_index * impact_percentile))
    if priority_score >= 70:
        priority = "P1"
        recommendation = "Priorizar inspección técnica en terreno y verificar exposición de población e infraestructura con autoridades locales."
    elif priority_score >= 45:
        priority = "P2"
        recommendation = "Programar revisión preventiva de la zona y confirmar cambios con observaciones y reportes locales."
    else:
        priority = "P3"
        recommendation = "Mantener vigilancia y actualizar el análisis con nuevas observaciones; no activar acciones solo por esta señal."

    return {
        "model_version": bundle["model_version"],
        "data_mode": "real_exploratory",
        "track_id": track_id,
        "municipality": municipality.strip().upper(),
        "department": department.strip().upper(),
        "height": int(phase.shape[0]),
        "width": int(phase.shape[1]),
        "valid_fraction": float(valid.mean()),
        "changed_fraction": changed_fraction,
        "anomaly_index": anomaly_index,
        "anomaly_mask": anomaly_mask.tolist(),
        "estimated_historical_impacts": estimates,
        "impact_percentile": impact_percentile,
        "priority_score": priority_score,
        "priority": priority,
        "recommendation": recommendation,
        "interpretation": "Exploratory relative prioritization, not an event probability, forecast, evacuation route, or safety guarantee.",
    }

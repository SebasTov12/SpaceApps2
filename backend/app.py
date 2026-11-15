from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import date, datetime, timezone

import psycopg
import numpy as np
from flask import Flask, jsonify, request
from psycopg.types.json import Jsonb
from werkzeug.exceptions import RequestEntityTooLarge

from nisar_forecast.forecast import Observation, build_forecast

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = int(os.getenv("SAROS_MAX_REQUEST_BYTES", str(32 * 1024 * 1024)))

DB_CONFIG = {
    "host": os.getenv("SAROS_DB_HOST", "postgres"),
    "port": int(os.getenv("SAROS_DB_PORT", "5432")),
    "dbname": os.getenv("SAROS_DB_NAME", "spaceapps2"),
    "user": os.getenv("SAROS_DB_USER", "spaceapps2_admin"),
    "password": os.getenv("SAROS_DB_PASSWORD", ""),
    "connect_timeout": 3,
}
MODEL_URL = os.getenv("SAROS_MODEL_URL", "http://predictor:8001").rstrip("/")
PREDICTION_TOKEN = os.getenv("SAROS_PREDICTION_TOKEN", "")
ASSISTANT_TOKEN = os.getenv("SAROS_ASSISTANT_TOKEN", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-20b").strip()
GROQ_API_URL = os.getenv("GROQ_API_URL", "https://api.groq.com/openai/v1/chat/completions").strip()


def connect_db() -> psycopg.Connection:
    return psycopg.connect(**DB_CONFIG)


def ensure_prediction_table() -> None:
    with connect_db() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS saros_predictions (
                id UUID PRIMARY KEY,
                created_at TIMESTAMPTZ NOT NULL,
                threshold REAL NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                changed_fraction DOUBLE PRECISION NOT NULL
            )
            """
        )


def model_ready() -> bool:
    try:
        with urllib.request.urlopen(f"{MODEL_URL}/health", timeout=3) as response:
            return response.status == 200
    except (urllib.error.URLError, TimeoutError):
        return False


def has_prediction_auth() -> bool:
    return bool(PREDICTION_TOKEN) and request.headers.get("Authorization") == f"Bearer {PREDICTION_TOKEN}"


def has_assistant_auth() -> bool:
    return bool(ASSISTANT_TOKEN) and request.headers.get("Authorization") == f"Bearer {ASSISTANT_TOKEN}"


def assistant_data_context() -> dict[str, object]:
    """Build a compact, database-backed context; keep forecasts and observations distinct."""
    context: dict[str, object] = {
        "nisar_real_observations": {"count": 0, "latest_date": None},
        "nisar_forecasts": [],
        "historical_hazard_records": {"count": 0, "latest_event_date": None},
        "latest_composite_assessment": None,
        "limitations": [
            "NISAR observations and model screening do not predict earthquakes.",
            "No future movement forecast exists unless it is listed in nisar_forecasts.",
            "Historical reported impacts are not causal sector-loss estimates.",
            "DIAN national tax revenue is economic context, not a local disaster-loss label.",
        ],
    }
    with connect_db() as connection:
        row = connection.execute(
            "SELECT count(*), max(observation_date) FROM nisar.observations WHERE data_mode = 'real'"
        ).fetchone()
        context["nisar_real_observations"] = {
            "count": row[0], "latest_date": row[1].isoformat() if row[1] else None,
        }
        forecasts = connection.execute(
            """
            SELECT r.aoi_id, r.stack_id, r.model_name, r.model_version, r.origin_date,
                   r.horizon_days, f.target_date, f.predicted_los_mm,
                   f.lower_los_mm, f.upper_los_mm, f.interval_status, f.quality_status,
                   r.metrics
              FROM nisar.forecasts f
              JOIN nisar.forecast_runs r USING (run_id)
             ORDER BY f.created_at DESC LIMIT 5
            """
        ).fetchall()
        context["nisar_forecasts"] = [
            {
                "aoi_id": item[0], "stack_id": item[1], "model": item[2], "model_version": item[3],
                "origin_date": item[4].isoformat(), "horizon_days": item[5],
                "target_date": item[6].isoformat(), "predicted_los_mm": item[7],
                "lower_los_mm": item[8], "upper_los_mm": item[9],
                "interval_status": item[10], "quality_status": item[11], "backtest": item[12],
            }
            for item in forecasts
        ]
        row = connection.execute(
            "SELECT count(*), max(event_date) FROM hazards.records WHERE record_type = 'event_impact'"
        ).fetchone()
        context["historical_hazard_records"] = {
            "count": row[0], "latest_event_date": row[1].isoformat() if row[1] else None,
            "warning": "Record count can include overlapping source snapshots; it is not a unique event count.",
        }
        row = connection.execute(
            """
            SELECT model_version, track_id, municipality, department, anomaly_index,
                   changed_fraction, impact_percentile, priority_score, priority,
                   estimated_historical_impacts, recommendation, data_mode, created_at
              FROM analysis.composite_assessments
             ORDER BY created_at DESC LIMIT 1
            """
        ).fetchone()
        if row:
            context["latest_composite_assessment"] = {
                "model_version": row[0], "track_id": row[1], "municipality": row[2],
                "department": row[3], "anomaly_index": row[4], "changed_fraction": row[5],
                "historical_impact_percentile": row[6], "relative_priority_score": row[7],
                "priority": row[8], "historical_impact_estimates": row[9],
                "recommendation": row[10], "data_mode": row[11], "created_at": row[12].isoformat(),
            }
    return context


def validate_nisar_observation(row: object) -> dict[str, object]:
    if not isinstance(row, dict):
        raise ValueError("Each observation must be a JSON object")
    required = {
        "aoi_id", "stack_id", "observation_date", "los_mm", "valid_fraction",
        "reference_method", "source_granules", "source_collection", "source_maturity",
        "processing_version", "data_mode",
    }
    missing = required - row.keys()
    if missing:
        raise ValueError(f"Missing observation fields: {sorted(missing)}")
    if row["data_mode"] != "real":
        raise ValueError("Only real NISAR observations are accepted")
    collection_by_maturity = {
        "VALIDATED": "NISAR_L2_GUNW_V1",
        "PROVISIONAL": "NISAR_L2_GUNW_PROVISIONAL_V1",
        "BETA": "NISAR_L2_GUNW_BETA_V1",
    }
    for field in ("aoi_id", "stack_id", "reference_method", "source_collection", "source_maturity", "processing_version"):
        if not isinstance(row[field], str) or not row[field].strip():
            raise ValueError(f"{field} must be a non-empty string")
    if row["source_maturity"] not in collection_by_maturity:
        raise ValueError("source_maturity must be VALIDATED, PROVISIONAL, or BETA")
    if row["source_collection"] != collection_by_maturity[row["source_maturity"]]:
        raise ValueError("source_collection does not match source_maturity")
    if (not isinstance(row["source_granules"], list) or not row["source_granules"]
            or any(not isinstance(item, str) or not item.strip()
                   or not item.startswith("NISAR_L2_") or "GUNW" not in item
                   for item in row["source_granules"])):
        raise ValueError("source_granules must contain NISAR L2 GUNW granule identifiers")
    quality = row.get("quality")
    if not isinstance(quality, dict):
        raise ValueError("quality must be an object with inspected source and quality evidence")
    evidence_fields = {
        "source_asset_sha256", "phase_dataset_path", "coherence_dataset_path",
        "mask_dataset_path", "connected_components_dataset_path",
        "reference_geometry_id", "stable_reference_applied",
        "coherence_threshold", "valid_pixel_count", "reference_pixel_count",
    }
    missing_evidence = evidence_fields - quality.keys()
    if missing_evidence:
        raise ValueError(f"Missing quality evidence fields: {sorted(missing_evidence)}")
    asset_hashes = quality["source_asset_sha256"]
    asset_roles = {"phase", "coherence", "mask", "connected_components"}
    if not isinstance(asset_hashes, dict) or asset_roles - asset_hashes.keys():
        raise ValueError("quality.source_asset_sha256 must map every required layer role to its SHA-256 digest")
    for role in asset_roles:
        digest = asset_hashes[role]
        if (not isinstance(digest, str) or len(digest) != 64
                or any(char not in "0123456789abcdefABCDEF" for char in digest)):
            raise ValueError(f"quality.source_asset_sha256.{role} must be a SHA-256 hex digest")
    for field in ("phase_dataset_path", "coherence_dataset_path", "mask_dataset_path",
                  "connected_components_dataset_path", "reference_geometry_id"):
        if not isinstance(quality[field], str) or not quality[field].strip():
            raise ValueError(f"quality.{field} must be a non-empty value discovered during inspection")
    if quality["stable_reference_applied"] is not True:
        raise ValueError("A stable reference must be applied before ingestion")
    try:
        coherence_threshold = float(quality["coherence_threshold"])
        valid_pixel_count_value = float(quality["valid_pixel_count"])
        reference_pixel_count_value = float(quality["reference_pixel_count"])
    except (TypeError, ValueError) as exc:
        raise ValueError("Quality thresholds and pixel counts must be numeric") from exc
    if (not np.isfinite(coherence_threshold) or not 0 <= coherence_threshold <= 1
            or not np.isfinite(valid_pixel_count_value)
            or not np.isfinite(reference_pixel_count_value)
            or not valid_pixel_count_value.is_integer()
            or not reference_pixel_count_value.is_integer()
            or valid_pixel_count_value <= 0 or reference_pixel_count_value <= 0):
        raise ValueError("Quality threshold must be in [0, 1] and pixel counts must be positive")
    valid_pixel_count = int(valid_pixel_count_value)
    reference_pixel_count = int(reference_pixel_count_value)
    try:
        date.fromisoformat(str(row["observation_date"]))
        los_mm = float(row["los_mm"])
        valid_fraction = float(row["valid_fraction"])
        uncertainty = row.get("uncertainty_mm")
        uncertainty = float(uncertainty) if uncertainty is not None else None
    except (TypeError, ValueError) as exc:
        raise ValueError("Invalid date or numeric observation field") from exc
    if not np.isfinite(los_mm) or not 0 < valid_fraction <= 1:
        raise ValueError("LOS must be finite and valid_fraction must be in (0, 1]")
    if uncertainty is not None and (not np.isfinite(uncertainty) or uncertainty <= 0):
        raise ValueError("uncertainty_mm must be positive when provided")
    return {
        **row,
        "observation_date": date.fromisoformat(str(row["observation_date"])),
        "los_mm": los_mm,
        "valid_fraction": valid_fraction,
        "uncertainty_mm": uncertainty,
        "quality": {
            **quality,
            "coherence_threshold": coherence_threshold,
            "valid_pixel_count": valid_pixel_count,
            "reference_pixel_count": reference_pixel_count,
        },
        "source_granules": [str(item) for item in row["source_granules"]],
    }


def dataset_catalog() -> list[dict[str, object]]:
    """Return provenance counts for model records without treating unknown as real."""
    datasets = []
    with connect_db() as connection:
        for schema, source, kind in (
            ("dian", "DIAN", "forecast_records"),
            ("nasa", "NASA-ISRO NISAR", "forecast_records"),
        ):
            total, synthetic, real, unclassified, latest = connection.execute(
                f"""
                SELECT count(*),
                       count(*) FILTER (WHERE payload->>'synthetic' = 'true'),
                       count(*) FILTER (WHERE payload->>'synthetic' = 'false'),
                       count(*) FILTER (WHERE payload->>'synthetic' IS NULL),
                       max(predicted_at)
                  FROM {schema}.predictions
                """
            ).fetchone()
            status = (
                "empty" if total == 0 else
                "demo" if synthetic == total else
                "real" if real == total else
                "mixed" if synthetic and real else
                "unclassified"
            )
            datasets.append({
                "id": f"{schema}.predictions",
                "source": source,
                "kind": kind,
                "records": total,
                "synthetic_records": synthetic,
                "real_records": real,
                "unclassified_records": unclassified,
                "status": status,
                "latest_record_at": latest.isoformat() if latest else None,
                "note": "Son registros de predicción, no granules ni observaciones satelitales." if schema == "nasa" else "Son registros de predicción, no datos de recaudo observados.",
            })
    return datasets


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "saros-api"})


@app.get("/ready")
def ready():
    try:
        with connect_db() as connection:
            connection.execute("SELECT 1")
    except psycopg.Error:
        return jsonify({"status": "not_ready", "dependency": "postgres"}), 503
    if not model_ready():
        return jsonify({"status": "not_ready", "dependency": "nisar-model"}), 503
    return jsonify({"status": "ready"})


@app.get("/api/v1/headlines")
def headlines():
    # The frontend falls back to its sourced ASF and demo data until the
    # publication pipeline begins writing reviewed headlines to the API.
    return jsonify({"headlines": []})


@app.get("/api/v1/datasets")
def datasets():
    try:
        return jsonify({"datasets": dataset_catalog()})
    except psycopg.Error:
        return jsonify({"error": "dataset_catalog_unavailable"}), 503


@app.get("/api/v1/manifest")
def manifest():
    try:
        return jsonify({
            "api_version": "v1",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "datasets": dataset_catalog(),
        })
    except psycopg.Error:
        return jsonify({"error": "dataset_manifest_unavailable"}), 503


@app.post("/api/v1/predictions")
def create_prediction():
    if not PREDICTION_TOKEN:
        return jsonify({"error": "prediction_endpoint_not_configured"}), 503
    if not has_prediction_auth():
        return jsonify({"error": "unauthorized"}), 401
    if request.mimetype != "application/octet-stream":
        return jsonify({"error": "expected_application_octet_stream_npz"}), 415

    patch = request.get_data(cache=False)
    if not patch:
        return jsonify({"error": "empty_npz_body"}), 400
    upstream = urllib.request.Request(
        f"{MODEL_URL}/predict",
        data=patch,
        headers={"Content-Type": "application/octet-stream"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(upstream, timeout=120) as response:
            prediction = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            detail = {"error": "model_service_error"}
        return jsonify(detail), exc.code
    except (urllib.error.URLError, TimeoutError):
        return jsonify({"error": "model_service_unavailable"}), 503

    prediction_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    try:
        ensure_prediction_table()
        with connect_db() as connection:
            connection.execute(
                """
                INSERT INTO saros_predictions
                    (id, created_at, threshold, width, height, changed_fraction)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    prediction_id,
                    created_at,
                    prediction["threshold"],
                    prediction["width"],
                    prediction["height"],
                    prediction["changed_fraction"],
                ),
            )
    except (psycopg.Error, KeyError, TypeError, ValueError):
        return jsonify({"error": "prediction_record_persistence_failed"}), 503

    prediction["id"] = prediction_id
    prediction["created_at"] = created_at.isoformat()
    return jsonify(prediction)


@app.post("/api/v1/analysis")
def create_composite_analysis():
    """Run the bundled NISAR anomaly + historical social-impact estimator."""
    if not PREDICTION_TOKEN:
        return jsonify({"error": "analysis_endpoint_not_configured"}), 503
    if not has_prediction_auth():
        return jsonify({"error": "unauthorized"}), 401
    if request.mimetype != "application/octet-stream":
        return jsonify({"error": "expected_application_octet_stream_npz"}), 415
    context = {key: request.args.get(key, "").strip() for key in ("track_id", "municipality", "department")}
    if any(not value for value in context.values()):
        return jsonify({"error": "missing_analysis_context", "required": list(context)}), 400
    if any(len(value) > 100 for value in context.values()):
        return jsonify({"error": "analysis_context_too_long"}), 400
    patch = request.get_data(cache=False)
    if not patch:
        return jsonify({"error": "empty_npz_body"}), 400
    query = urllib.parse.urlencode(context)
    upstream = urllib.request.Request(
        f"{MODEL_URL}/analyze?{query}",
        data=patch,
        headers={"Content-Type": "application/octet-stream"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(upstream, timeout=120) as response:
            analysis = json.loads(response.read())
    except urllib.error.HTTPError as exc:
        try:
            detail = json.loads(exc.read())
        except (json.JSONDecodeError, UnicodeDecodeError):
            detail = {"error": "model_service_error"}
        return jsonify(detail), exc.code
    except (urllib.error.URLError, TimeoutError):
        return jsonify({"error": "model_service_unavailable"}), 503

    assessment_id = str(uuid.uuid4())
    created_at = datetime.now(timezone.utc)
    try:
        with connect_db() as connection:
            connection.execute(
                """
                INSERT INTO analysis.composite_assessments
                    (id, created_at, model_version, track_id, municipality, department,
                     anomaly_index, changed_fraction, impact_percentile, priority_score,
                     priority, estimated_historical_impacts, recommendation, data_mode)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    assessment_id,
                    created_at,
                    analysis["model_version"],
                    analysis["track_id"],
                    analysis["municipality"],
                    analysis["department"],
                    analysis["anomaly_index"],
                    analysis["changed_fraction"],
                    analysis["impact_percentile"],
                    analysis["priority_score"],
                    analysis["priority"],
                    Jsonb(analysis["estimated_historical_impacts"]),
                    analysis["recommendation"],
                    analysis["data_mode"],
                ),
            )
    except (psycopg.Error, KeyError, TypeError, ValueError):
        return jsonify({"error": "analysis_persistence_failed", "hint": "Apply pipeline/sql/007_composite_model.sql first."}), 503

    analysis["id"] = assessment_id
    analysis["created_at"] = created_at.isoformat()
    return jsonify(analysis)


@app.post("/api/v1/assistant/chat")
def assistant_chat():
    """Answer from stored SAROS evidence; Groq explains results but never creates them."""
    if not ASSISTANT_TOKEN or not GROQ_API_KEY:
        return jsonify({"error": "assistant_not_configured"}), 503
    if not has_assistant_auth():
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True)
    messages = body.get("messages") if isinstance(body, dict) else None
    if not isinstance(messages, list) or not messages or len(messages) > 8:
        return jsonify({"error": "expected_1_to_8_messages"}), 400
    clean_messages: list[dict[str, str]] = []
    for item in messages:
        if (not isinstance(item, dict) or item.get("role") not in {"user", "assistant"}
                or not isinstance(item.get("content"), str) or not item["content"].strip()
                or len(item["content"]) > 1500):
            return jsonify({"error": "invalid_message", "limit_chars": 1500}), 400
        clean_messages.append({"role": item["role"], "content": item["content"].strip()})
    if clean_messages[-1]["role"] != "user":
        return jsonify({"error": "last_message_must_be_user"}), 400

    try:
        context = assistant_data_context()
    except psycopg.Error:
        return jsonify({"error": "assistant_database_context_unavailable"}), 503
    system_message = {
        "role": "system",
        "content": (
            "Eres el asistente territorial SAROS. Responde en español claro y distingue observaciones, "
            "anomalías, pronósticos y escenarios históricos. Basa cualquier afirmación sobre el estado "
            "del proyecto únicamente en el contexto JSON adjunto. Si el contexto no contiene un pronóstico, "
            "di que no hay uno disponible. No inventes fechas, probabilidades, daños, sectores afectados, "
            "rutas seguras ni recomendaciones oficiales. El modelo compuesto actual da priorización relativa "
            "exploratoria; sus impactos son estimaciones históricas municipales, no causalidad ni pérdidas "
            "futuras. NISAR no predice terremotos. Para acciones urgentes remite a autoridades locales y "
            "organismos oficiales. El usuario puede pedir acciones; presenta límites y fuente de cada dato.\n\n"
            "Contexto actual de la base SAROS (JSON):\n" + json.dumps(context, ensure_ascii=False, default=str)
        ),
    }
    payload = json.dumps({
        "model": GROQ_MODEL,
        "messages": [system_message, *clean_messages],
        "temperature": 0.2,
        "max_completion_tokens": 650,
    }).encode("utf-8")
    upstream = urllib.request.Request(
        GROQ_API_URL,
        data=payload,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(upstream, timeout=35) as response:
            completion = json.loads(response.read())
        answer = completion["choices"][0]["message"]["content"].strip()
        if not answer:
            raise ValueError("Groq returned an empty response")
    except urllib.error.HTTPError as exc:
        return jsonify({"error": "groq_upstream_error", "status": exc.code}), 502
    except (urllib.error.URLError, TimeoutError):
        return jsonify({"error": "groq_unavailable"}), 503
    except (KeyError, IndexError, TypeError, ValueError, json.JSONDecodeError):
        return jsonify({"error": "invalid_groq_response"}), 502

    interaction_id = str(uuid.uuid4())
    try:
        with connect_db() as connection:
            connection.execute(
                """
                INSERT INTO analysis.assistant_interactions
                    (id, created_at, model, user_message, answer, context_snapshot)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (interaction_id, datetime.now(timezone.utc), GROQ_MODEL,
                 clean_messages[-1]["content"], answer, Jsonb(context)),
            )
    except psycopg.Error:
        return jsonify({"error": "assistant_response_persistence_failed",
                        "hint": "Apply pipeline/sql/008_assistant_interactions.sql first."}), 503
    return jsonify({"answer": answer, "model": GROQ_MODEL, "interaction_id": interaction_id,
                    "context_sources": ["nisar.observations", "nisar.forecasts", "hazards.records",
                                        "analysis.composite_assessments"]})


@app.post("/api/v1/nisar/observations")
def ingest_nisar_observations():
    """Persist quality-controlled, provenance-rich measurements from the worker."""
    if not PREDICTION_TOKEN:
        return jsonify({"error": "nisar_ingest_not_configured"}), 503
    if not has_prediction_auth():
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("observations"), list) or not body["observations"]:
        return jsonify({"error": "expected_non_empty_observations_array"}), 400
    try:
        rows = [validate_nisar_observation(row) for row in body["observations"]]
    except ValueError as exc:
        return jsonify({"error": "invalid_nisar_observation", "detail": str(exc)}), 400
    try:
        with connect_db() as connection:
            inserted = 0
            for row in rows:
                result = connection.execute(
                    """
                    INSERT INTO nisar.observations
                        (aoi_id, stack_id, observation_date, los_mm, uncertainty_mm,
                         valid_fraction, reference_method, quality, source_granules,
                         source_collection, source_maturity, processing_version, data_mode)
                    VALUES (%(aoi_id)s, %(stack_id)s, %(observation_date)s, %(los_mm)s,
                            %(uncertainty_mm)s, %(valid_fraction)s, %(reference_method)s,
                            %(quality)s, %(source_granules)s, %(source_collection)s,
                            %(source_maturity)s, %(processing_version)s, %(data_mode)s)
                    ON CONFLICT (aoi_id, stack_id, observation_date, processing_version) DO NOTHING
                    """,
                    {**row, "quality": Jsonb(row["quality"])},
                )
                inserted += result.rowcount
        return jsonify({"received": len(rows), "inserted": inserted, "duplicates_ignored": len(rows) - inserted}), 201
    except psycopg.Error:
        return jsonify({"error": "nisar_observation_persistence_failed", "hint": "Apply pipeline/sql/004_nisar_forecast.sql first."}), 503


@app.get("/api/v1/nisar/observations/checkpoint")
def nisar_observation_checkpoint():
    """Return the latest real observation for an incremental catalog update."""
    if not PREDICTION_TOKEN:
        return jsonify({"error": "nisar_ingest_not_configured"}), 503
    if not has_prediction_auth():
        return jsonify({"error": "unauthorized"}), 401
    aoi_id = request.args.get("aoi_id", "").strip()
    stack_id = request.args.get("stack_id", "").strip()
    processing_version = request.args.get("processing_version", "").strip()
    if not all((aoi_id, stack_id, processing_version)):
        return jsonify({"error": "aoi_id_stack_id_and_processing_version_required"}), 400
    try:
        with connect_db() as connection:
            row = connection.execute(
                """
                SELECT count(*), max(observation_date)
                  FROM nisar.observations
                 WHERE aoi_id = %s AND stack_id = %s AND processing_version = %s
                   AND data_mode = 'real'
                """,
                (aoi_id, stack_id, processing_version),
            ).fetchone()
            latest_granules = []
            if row[1] is not None:
                latest_granules = connection.execute(
                    """
                    SELECT source_granules
                      FROM nisar.observations
                     WHERE aoi_id = %s AND stack_id = %s AND processing_version = %s
                       AND data_mode = 'real' AND observation_date = %s
                     ORDER BY observation_id DESC LIMIT 1
                    """,
                    (aoi_id, stack_id, processing_version, row[1]),
                ).fetchone()[0]
        return jsonify({
            "aoi_id": aoi_id,
            "stack_id": stack_id,
            "processing_version": processing_version,
            "observation_count": row[0],
            "last_processed_date": row[1].isoformat() if row[1] else None,
            "source_granules": latest_granules,
            "data_mode": "real",
        })
    except psycopg.Error:
        return jsonify({"error": "nisar_checkpoint_unavailable", "hint": "Apply pipeline/sql/004_nisar_forecast.sql first."}), 503


@app.post("/api/v1/nisar/forecasts/run")
def run_nisar_forecast():
    """Run a real-data temporal backtest and persist one forecast target."""
    if not PREDICTION_TOKEN:
        return jsonify({"error": "nisar_forecast_not_configured"}), 503
    if not has_prediction_auth():
        return jsonify({"error": "unauthorized"}), 401
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        return jsonify({"error": "expected_json_object"}), 400
    aoi_id, stack_id, processing_version = body.get("aoi_id"), body.get("stack_id"), body.get("processing_version")
    if any(not isinstance(value, str) or not value.strip() for value in (aoi_id, stack_id, processing_version)):
        return jsonify({"error": "aoi_id_stack_id_and_processing_version_required"}), 400
    try:
        horizon_days = int(body.get("horizon_days", 24))
        tolerance_days = int(body.get("tolerance_days", 8))
        min_train_observations = int(body.get("min_train_observations", 5))
        min_valid_fraction = float(body.get("min_valid_fraction", 0.5))
        if horizon_days < 1 or tolerance_days < 0 or min_train_observations < 3 or not 0 <= min_valid_fraction <= 1:
            raise ValueError
    except (TypeError, ValueError):
        return jsonify({"error": "invalid_forecast_parameters"}), 400
    try:
        with connect_db() as connection:
            rows = connection.execute(
                """
                SELECT observation_id, observation_date, los_mm, valid_fraction,
                       uncertainty_mm, source_granules
                  FROM nisar.observations
                 WHERE aoi_id = %s AND stack_id = %s AND processing_version = %s AND data_mode = 'real'
                   AND valid_fraction >= %s
                 ORDER BY observation_date
                """,
                (aoi_id.strip(), stack_id.strip(), processing_version.strip(), min_valid_fraction),
            ).fetchall()
            if len(rows) < 2:
                return jsonify({"error": "insufficient_real_observations", "count": len(rows)}), 422
            observations = [
                Observation(day=row[1], los_mm=row[2], valid_fraction=row[3], aoi_id=aoi_id.strip(),
                            stack_id=stack_id.strip(), granule_ids=";".join(row[5]), uncertainty_mm=row[4])
                for row in rows
            ]
            provenance = {
                "aoi_id": aoi_id.strip(), "stack_id": stack_id.strip(),
                "processing_version": processing_version.strip(),
                "observation_ids": [row[0] for row in rows],
                "source_granules": sorted({granule for row in rows for granule in row[5]}),
                "accepted_observations": len(rows), "data_mode": "real",
            }
            result = build_forecast(observations, provenance, horizon_days, tolerance_days,
                                    min_train_observations, min_valid_fraction)
            run_id = uuid.uuid4()
            backtest = result["backtest"]
            params = {"horizon_days": horizon_days, "tolerance_days": tolerance_days,
                      "min_train_observations": min_train_observations,
                 "min_valid_fraction": min_valid_fraction,
                 "processing_version": processing_version.strip()}
            connection.execute(
                """
                INSERT INTO nisar.forecast_runs
                    (run_id, aoi_id, stack_id, model_name, model_version, origin_date,
                     horizon_days, training_observation_count, observation_ids,
                     input_granules, metrics, parameters, data_mode)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'real')
                """,
                (run_id, aoi_id.strip(), stack_id.strip(), result["model"]["name"],
                 result["model"]["version"], observations[-1].day, horizon_days, len(rows),
                 provenance["observation_ids"], provenance["source_granules"],
                 Jsonb(backtest), Jsonb(params)),
            )
            target = date.fromisoformat(result["forecast"]["target_date"])
            connection.execute(
                """
                INSERT INTO nisar.forecasts
                    (run_id, target_date, predicted_los_mm, lower_los_mm, upper_los_mm,
                     interval_status, quality_status)
                VALUES (%s, %s, %s, NULL, NULL, %s, %s)
                """,
                (run_id, target, result["forecast"]["los_mm"],
                 result["quality"]["confidence_interval_status"], result["status"]),
            )
        result["run_id"] = str(run_id)
        return jsonify(result), 201
    except psycopg.Error:
        return jsonify({"error": "nisar_forecast_persistence_failed", "hint": "Apply pipeline/sql/004_nisar_forecast.sql first."}), 503


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return jsonify({"error": "request_too_large"}), 413

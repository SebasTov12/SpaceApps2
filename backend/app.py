from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone

import psycopg
from flask import Flask, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

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
    if request.headers.get("Authorization") != f"Bearer {PREDICTION_TOKEN}":
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


@app.errorhandler(RequestEntityTooLarge)
def request_too_large(_error):
    return jsonify({"error": "request_too_large"}), 413

-- Scientific NISAR time-series and forecast records.
-- Raw HDF5/COG assets remain in file/object storage. This migration stores
-- provenance and compact, quality-filtered AOI observations only.

CREATE SCHEMA IF NOT EXISTS nisar;

CREATE TABLE IF NOT EXISTS nisar.observations (
    observation_id bigserial PRIMARY KEY,
    aoi_id text NOT NULL,
    stack_id text NOT NULL,
    observation_date date NOT NULL,
    los_mm double precision NOT NULL,
    uncertainty_mm double precision,
    valid_fraction double precision NOT NULL CHECK (valid_fraction BETWEEN 0 AND 1),
    reference_method text NOT NULL,
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_granules text[] NOT NULL CHECK (cardinality(source_granules) > 0),
    source_collection text NOT NULL,
    source_maturity text NOT NULL,
    processing_version text NOT NULL,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (aoi_id, stack_id, observation_date, processing_version)
);

CREATE INDEX IF NOT EXISTS nisar_observations_aoi_stack_date_idx
    ON nisar.observations (aoi_id, stack_id, observation_date);

CREATE TABLE IF NOT EXISTS nisar.forecast_runs (
    run_id uuid PRIMARY KEY,
    aoi_id text NOT NULL,
    stack_id text NOT NULL,
    model_name text NOT NULL,
    model_version text NOT NULL,
    origin_date date NOT NULL,
    horizon_days integer NOT NULL CHECK (horizon_days > 0),
    training_observation_count integer NOT NULL CHECK (training_observation_count > 0),
    observation_ids bigint[] NOT NULL,
    input_granules text[] NOT NULL,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nisar_forecast_runs_aoi_stack_origin_idx
    ON nisar.forecast_runs (aoi_id, stack_id, origin_date DESC);

CREATE TABLE IF NOT EXISTS nisar.forecasts (
    forecast_id bigserial PRIMARY KEY,
    run_id uuid NOT NULL REFERENCES nisar.forecast_runs(run_id) ON DELETE RESTRICT,
    target_date date NOT NULL,
    predicted_los_mm double precision NOT NULL,
    lower_los_mm double precision,
    upper_los_mm double precision,
    interval_status text NOT NULL DEFAULT 'not_calibrated',
    quality_status text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, target_date)
);

-- Auditable, scheduled SAROS readiness and historical validation reports.
CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE IF NOT EXISTS analysis.operational_snapshots (
    snapshot_id bigserial PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    report jsonb NOT NULL,
    schema_version text GENERATED ALWAYS AS (report->>'schema_version') STORED
);

CREATE INDEX IF NOT EXISTS operational_snapshots_created_idx
    ON analysis.operational_snapshots (created_at DESC);

COMMENT ON TABLE analysis.operational_snapshots IS
    'Scheduled aggregate readiness, catalog coverage, and out-of-time historical-impact backtest snapshots; contains no credentials or personal records.';

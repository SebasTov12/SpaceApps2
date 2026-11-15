-- Persist relative composite assessments without retaining large raster masks.
CREATE SCHEMA IF NOT EXISTS analysis;

CREATE TABLE IF NOT EXISTS analysis.composite_assessments (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL,
    model_version text NOT NULL,
    track_id text NOT NULL,
    municipality text NOT NULL,
    department text NOT NULL,
    anomaly_index double precision NOT NULL CHECK (anomaly_index BETWEEN 0 AND 100),
    changed_fraction double precision NOT NULL CHECK (changed_fraction BETWEEN 0 AND 1),
    impact_percentile double precision NOT NULL CHECK (impact_percentile BETWEEN 0 AND 100),
    priority_score double precision NOT NULL CHECK (priority_score BETWEEN 0 AND 100),
    priority text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3')),
    estimated_historical_impacts jsonb NOT NULL,
    recommendation text NOT NULL,
    data_mode text NOT NULL CHECK (data_mode = 'real_exploratory')
);

CREATE INDEX IF NOT EXISTS composite_assessments_location_created_idx
    ON analysis.composite_assessments (department, municipality, created_at DESC);
CREATE INDEX IF NOT EXISTS composite_assessments_priority_created_idx
    ON analysis.composite_assessments (priority, created_at DESC);

COMMENT ON TABLE analysis.composite_assessments IS
    'Exploratory relative-priority outputs from real NISAR observations and historical reported impacts; these are not event probabilities.';

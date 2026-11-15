-- Public DIAN monthly gross collection. Amounts remain nominal million COP,
-- exactly as published by DIAN; raw tax columns are retained as reported.

CREATE TABLE IF NOT EXISTS dian.monthly_observations (
    period_start date PRIMARY KEY CHECK (extract(day FROM period_start) = 1),
    total_million_cop numeric(24, 6) NOT NULL CHECK (total_million_cop > 0),
    tax_columns_million_cop jsonb NOT NULL,
    is_preliminary boolean NOT NULL,
    source_url text NOT NULL,
    source_sha256 char(64) NOT NULL CHECK (length(source_sha256) = 64),
    source_update_note text NOT NULL,
    ingested_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dian_monthly_observations_preliminary_idx
    ON dian.monthly_observations (is_preliminary, period_start);

REVOKE ALL ON TABLE dian.monthly_observations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE dian.monthly_observations TO spaceapps2_admin;

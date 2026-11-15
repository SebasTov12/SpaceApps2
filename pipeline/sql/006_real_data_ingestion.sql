-- Reproducible ingestion of public Colombian impacts and NISAR AOI assets.
-- Raw and clipped raster files remain file assets; PostgreSQL stores full
-- public source records, geometries, catalog metadata, quality and provenance.

CREATE SCHEMA IF NOT EXISTS hazards;
CREATE SCHEMA IF NOT EXISTS analysis;
CREATE SCHEMA IF NOT EXISTS nisar;

CREATE TABLE IF NOT EXISTS hazards.source_snapshots (
    snapshot_id text PRIMARY KEY,
    source_id text NOT NULL,
    category text NOT NULL,
    endpoint_host text NOT NULL,
    endpoint_path text NOT NULL,
    content_type text,
    retrieved_at timestamptz NOT NULL,
    source_record_count integer NOT NULL CHECK (source_record_count >= 0),
    normalized_record_count integer NOT NULL CHECK (normalized_record_count >= 0),
    exact_duplicates_removed integer NOT NULL DEFAULT 0 CHECK (exact_duplicates_removed >= 0),
    normalization_version text NOT NULL,
    raw_file_name text NOT NULL,
    raw_sha256 text NOT NULL CHECK (raw_sha256 ~ '^[0-9a-f]{64}$'),
    raw_bytes bigint NOT NULL CHECK (raw_bytes >= 0),
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (source_id, raw_sha256)
);

CREATE INDEX IF NOT EXISTS source_snapshots_source_retrieved_idx
    ON hazards.source_snapshots (source_id, retrieved_at DESC);

CREATE TABLE IF NOT EXISTS hazards.records (
    snapshot_id text NOT NULL REFERENCES hazards.source_snapshots(snapshot_id) ON DELETE RESTRICT,
    source_id text NOT NULL,
    source_record_id text NOT NULL,
    record_hash text NOT NULL CHECK (record_hash ~ '^[0-9a-f]{64}$'),
    record_type text NOT NULL CHECK (record_type IN ('event_impact', 'landslide_inventory', 'geologic_hazard', 'local_alert')),
    event_date date,
    department text,
    municipality text,
    divipola text,
    event_type text,
    deaths numeric,
    injured numeric,
    missing numeric,
    affected_people numeric,
    affected_families numeric,
    homes_destroyed numeric,
    homes_damaged numeric,
    roads_damaged numeric,
    bridges_damaged numeric,
    health_centers_affected numeric,
    schools_affected numeric,
    hectares_affected numeric,
    economic_support_cop numeric,
    normalized_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    geometry_geojson jsonb,
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_payload jsonb NOT NULL,
    normalization_version text NOT NULL,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    ingested_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS hazard_records_source_type_date_idx
    ON hazards.records (source_id, record_type, event_date);
CREATE INDEX IF NOT EXISTS hazard_records_admin_area_idx
    ON hazards.records (department, municipality, divipola);
CREATE INDEX IF NOT EXISTS hazard_records_geometry_gin_idx
    ON hazards.records USING gin (geometry_geojson);

CREATE TABLE IF NOT EXISTS nisar.catalog_assets (
    granule_name text PRIMARY KEY,
    aoi_id text NOT NULL,
    processing_level text NOT NULL,
    collection text NOT NULL,
    maturity text NOT NULL,
    orbit_direction text,
    relative_orbit text,
    frame text,
    polarization text,
    reference_date date,
    secondary_date date,
    size_bytes bigint,
    geometry_geojson jsonb NOT NULL,
    source_properties jsonb NOT NULL,
    source text NOT NULL DEFAULT 'ASF DAAC',
    inventoried_at timestamptz NOT NULL,
    data_mode text NOT NULL CHECK (data_mode = 'real_metadata')
);

CREATE INDEX IF NOT EXISTS nisar_catalog_aoi_product_date_idx
    ON nisar.catalog_assets (aoi_id, processing_level, secondary_date);
CREATE INDEX IF NOT EXISTS nisar_catalog_stack_idx
    ON nisar.catalog_assets (relative_orbit, frame, orbit_direction, polarization, maturity);

CREATE TABLE IF NOT EXISTS nisar.raster_assets (
    asset_id bigserial PRIMARY KEY,
    granule_name text NOT NULL REFERENCES nisar.catalog_assets(granule_name) ON DELETE RESTRICT,
    variable text NOT NULL,
    collection text NOT NULL,
    storage_uri text NOT NULL,
    file_name text NOT NULL,
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    byte_size bigint NOT NULL CHECK (byte_size > 0),
    width integer,
    height integer,
    dtype text,
    crs text,
    units text,
    transform jsonb,
    bounds jsonb,
    valid_pixel_count bigint,
    valid_fraction double precision,
    statistics jsonb NOT NULL DEFAULT '{}'::jsonb,
    inspected_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (granule_name, variable, sha256)
);

CREATE INDEX IF NOT EXISTS nisar_raster_assets_variable_idx
    ON nisar.raster_assets (variable, granule_name);

CREATE TABLE IF NOT EXISTS analysis.real_model_runs (
    run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_name text NOT NULL,
    model_version text NOT NULL,
    task text NOT NULL,
    aoi_id text,
    training_started_at timestamptz,
    training_finished_at timestamptz,
    sample_count integer NOT NULL CHECK (sample_count >= 0),
    source_snapshots text[] NOT NULL DEFAULT '{}',
    input_asset_hashes text[] NOT NULL DEFAULT '{}',
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
    artifact_uri text,
    status text NOT NULL CHECK (status IN ('exploratory', 'validated', 'blocked')),
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE hazards.records IS
    'Harmonized public event, landslide inventory, geologic hazard, and local alert records. Exact duplicate input rows are omitted; source payloads and geometries remain auditable.';
COMMENT ON TABLE nisar.raster_assets IS
    'Registry for real AOI-clipped NISAR rasters; pixel data stays in file/object storage, while checksums and metadata are stored in PostgreSQL.';
COMMENT ON TABLE analysis.real_model_runs IS
    'Real-data training and evaluation registry. Synthetic training runs remain separate in analysis.model_training_runs.';

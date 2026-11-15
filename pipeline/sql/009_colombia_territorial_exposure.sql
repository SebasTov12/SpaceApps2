-- National Colombian municipal exposure data and auditable source snapshots.
-- Geometry and attributes preserve each source's native scale and vintage.
CREATE SCHEMA IF NOT EXISTS territorial;

CREATE TABLE IF NOT EXISTS territorial.source_snapshots (
    snapshot_id text PRIMARY KEY,
    source_id text NOT NULL,
    source_url text NOT NULL,
    source_vintage text,
    retrieved_at timestamptz NOT NULL,
    record_count bigint NOT NULL CHECK (record_count >= 0),
    sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    file_name text NOT NULL,
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    UNIQUE (source_id, sha256)
);

CREATE TABLE IF NOT EXISTS territorial.municipal_profiles (
    divipola text PRIMARY KEY CHECK (divipola ~ '^[0-9]{5}$'),
    department_code text,
    department_name text,
    municipality_name text NOT NULL,
    census_vintage text NOT NULL DEFAULT '2018',
    population_total numeric,
    population_male numeric,
    population_female numeric,
    households_total numeric,
    dwellings_total numeric,
    occupied_dwellings numeric,
    nonresidential_units numeric,
    nonresidential_activity_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
    housing_deficit_count numeric,
    housing_deficit_percent numeric,
    housing_deficit_components jsonb NOT NULL DEFAULT '{}'::jsonb,
    multidimensional_poverty_index numeric,
    health_facility_count integer,
    school_site_count integer,
    geometry_geojson jsonb,
    source_snapshot_ids text[] NOT NULL DEFAULT '{}',
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS municipal_profiles_department_idx
    ON territorial.municipal_profiles (department_code, municipality_name);
CREATE INDEX IF NOT EXISTS municipal_profiles_geometry_gin_idx
    ON territorial.municipal_profiles USING gin (geometry_geojson);

CREATE TABLE IF NOT EXISTS territorial.exposure_features (
    feature_id text PRIMARY KEY,
    divipola text REFERENCES territorial.municipal_profiles(divipola) ON DELETE SET NULL,
    source_snapshot_id text NOT NULL REFERENCES territorial.source_snapshots(snapshot_id) ON DELETE RESTRICT,
    feature_type text NOT NULL CHECK (feature_type IN ('road', 'school', 'health_facility', 'agricultural_area', 'other')),
    name text,
    source_vintage text,
    geometry_geojson jsonb,
    properties jsonb NOT NULL DEFAULT '{}'::jsonb,
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS territorial.agricultural_production (
    snapshot_id text NOT NULL REFERENCES territorial.source_snapshots(snapshot_id) ON DELETE RESTRICT,
    source_record_id text NOT NULL,
    divipola text,
    department_name text,
    municipality_name text,
    year integer,
    period text,
    crop_group text,
    crop_subgroup text,
    crop_name text,
    crop_detail text,
    crop_code text,
    scientific_name text,
    crop_cycle text,
    crop_state text,
    area_sown_ha numeric,
    area_harvested_ha numeric,
    production_tonnes numeric,
    yield_tonnes_per_ha numeric,
    source_payload jsonb NOT NULL,
    quality jsonb NOT NULL DEFAULT '{}'::jsonb,
    data_mode text NOT NULL CHECK (data_mode = 'real'),
    ingested_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (snapshot_id, source_record_id)
);

CREATE INDEX IF NOT EXISTS agricultural_production_municipality_year_idx
    ON territorial.agricultural_production (divipola, year DESC, period);
CREATE INDEX IF NOT EXISTS agricultural_production_crop_year_idx
    ON territorial.agricultural_production (crop_name, year DESC);

CREATE INDEX IF NOT EXISTS exposure_features_divipola_type_idx
    ON territorial.exposure_features (divipola, feature_type);
CREATE INDEX IF NOT EXISTS exposure_features_geometry_gin_idx
    ON territorial.exposure_features USING gin (geometry_geojson);

COMMENT ON TABLE territorial.municipal_profiles IS
    'Municipal exposure indicators from official sources. CNPV variables are 2018 census values; null means unavailable, never zero.';
COMMENT ON TABLE territorial.exposure_features IS
    'Georeferenced exposure assets, preserving the source scale, vintage, quality and provenance. Not a damage prediction.';
COMMENT ON TABLE territorial.agricultural_production IS
    'Municipal crop area, production and yield statistics from UPRA EVA. These are agricultural activity indicators, not disaster-loss labels or georeferenced individual plots.';

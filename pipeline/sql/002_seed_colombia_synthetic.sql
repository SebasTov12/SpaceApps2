-- Escenario completamente sintético. No contiene observaciones DIAN ni granulos ASF.
WITH forecasts (period_start, value_cop, previous_value_cop) AS (
    VALUES
        (DATE '2026-12-01', 23600000000000::numeric, 22900000000000::numeric),
        (DATE '2027-01-01', 22100000000000::numeric, 23600000000000::numeric),
        (DATE '2027-02-01', 24250000000000::numeric, 22100000000000::numeric),
        (DATE '2027-03-01', 24800000000000::numeric, 24250000000000::numeric),
        (DATE '2027-04-01', 25200000000000::numeric, 24800000000000::numeric),
        (DATE '2027-05-01', 25500000000000::numeric, 25200000000000::numeric)
)
INSERT INTO dian.predictions (
    model_name, model_version, run_id, prediction_key, predicted_at, payload
)
SELECT
    'dian_tax_collection_synthetic_scenario',
    'synthetic-v1',
    'synthetic-colombia-bootstrap-v1',
    'CO-national-' || to_char(f.period_start, 'YYYY-MM'),
    now(),
    jsonb_build_object(
        'synthetic', true,
        'data_origin', 'generated_synthetic_scenario',
        'geography', jsonb_build_object(
            'country_code', 'CO',
            'country_name', 'Colombia',
            'scope_level', 'national',
            'department_code', NULL,
            'municipality_code', NULL
        ),
        'period', jsonb_build_object(
            'start', to_char(f.period_start, 'YYYY-MM-DD'),
            'end', to_char((f.period_start + INTERVAL '1 month - 1 day')::date, 'YYYY-MM-DD'),
            'granularity', 'month'
        ),
        'forecast', jsonb_build_object(
            'target', 'monthly_gross_tax_collection',
            'value', f.value_cop,
            'unit', 'COP',
            'interval_80_percent', jsonb_build_object(
                'lower', round(f.value_cop * 0.92),
                'upper', round(f.value_cop * 1.08)
            )
        ),
        'baseline', jsonb_build_object(
            'previous_value', f.previous_value_cop,
            'unit', 'COP',
            'comparison', 'previous synthetic month'
        ),
        'components', jsonb_build_array(
            jsonb_build_object('tax_type', 'IVA', 'value', round(f.value_cop * 0.33), 'unit', 'COP'),
            jsonb_build_object('tax_type', 'renta', 'value', round(f.value_cop * 0.42), 'unit', 'COP'),
            jsonb_build_object('tax_type', 'retencion_en_la_fuente', 'value', round(f.value_cop * 0.25), 'unit', 'COP')
        ),
        'model_context', jsonb_build_object(
            'name', 'synthetic monthly scenario',
            'method', 'predefined synthetic values for pipeline bootstrap',
            'trained_on_real_data', false
        ),
        'source_context', jsonb_build_object(
            'official_reference', 'https://www.dian.gov.co/dian/cifras/Paginas/EstadisticasRecaudo.aspx',
            'reference_used_for', 'field selection and aggregation metadata only',
            'official_data_downloaded', false,
            'official_series_description', 'DIAN publishes monthly and annual collection statistics by tax type and territorial section.'
        ),
        'limitations', jsonb_build_array(
            'All values and tax-type shares are synthetic and are not DIAN statistics.',
            'This record has national scope and cannot be attributed to Norte de Santander or the pilot AOI.',
            'The interval is illustrative and has not been calibrated on historical DIAN data.'
        )
    )
FROM forecasts AS f
ON CONFLICT (run_id, prediction_key) DO UPDATE
    SET model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        predicted_at = EXCLUDED.predicted_at,
        payload = EXCLUDED.payload;
WITH forecasts (period_start, value_mm, previous_value_mm, mean_coherence, observation_count) AS (
    VALUES
        (DATE '2026-12-01', 10.800::numeric, 10.300::numeric, 0.71::numeric, 2),
        (DATE '2027-01-01', 11.000::numeric, 10.800::numeric, 0.68::numeric, 2),
        (DATE '2027-02-01', 11.400::numeric, 11.000::numeric, 0.73::numeric, 3),
        (DATE '2027-03-01', 11.500::numeric, 11.400::numeric, 0.69::numeric, 2),
        (DATE '2027-04-01', 11.900::numeric, 11.500::numeric, 0.72::numeric, 3),
        (DATE '2027-05-01', 12.100::numeric, 11.900::numeric, 0.70::numeric, 2)
)
INSERT INTO nasa.predictions (
    model_name, model_version, run_id, prediction_key, predicted_at, payload
)
SELECT
    'nisar_gunw_synthetic_los_scenario',
    'synthetic-v1',
    'synthetic-colombia-bootstrap-v1',
    'CO-54-colombia-ladera-' || to_char(f.period_start, 'YYYY-MM'),
    now(),
    jsonb_build_object(
        'synthetic', true,
        'data_origin', 'generated_synthetic_scenario',
        'geography', jsonb_build_object(
            'country_code', 'CO',
            'department_code', '54',
            'department_name', 'Norte de Santander',
            'site_id', 'colombia-ladera',
            'scope_level', 'site_aoi',
            'bbox_wgs84', jsonb_build_array(-72.56, 7.82, -72.44, 7.94),
            'center_wgs84', jsonb_build_object('latitude', 7.88, 'longitude', -72.50)
        ),
        'period', jsonb_build_object(
            'start', to_char(f.period_start, 'YYYY-MM-DD'),
            'end', to_char((f.period_start + INTERVAL '1 month - 1 day')::date, 'YYYY-MM-DD'),
            'granularity', 'month'
        ),
        'forecast', jsonb_build_object(
            'target', 'monthly_mean_signed_line_of_sight_displacement',
            'value', f.value_mm,
            'unit', 'mm',
            'illustrative_interval', jsonb_build_object(
                'lower', round(f.value_mm - 2.0, 3),
                'upper', round(f.value_mm + 2.0, 3)
            )
        ),
        'baseline', jsonb_build_object(
            'previous_value', f.previous_value_mm,
            'unit', 'mm',
            'comparison', 'previous synthetic month'
        ),
        'features', jsonb_build_object(
            'synthetic_observation_count', f.observation_count,
            'nominal_acquisition_interval_days', 12,
            'mean_coherence', f.mean_coherence,
            'synthetic_unwrapped_phase_rad', round((-4 * pi() * (f.value_mm / 1000.0) / 0.2384)::numeric, 6),
            'wavelength_m', 0.2384
        ),
        'model_context', jsonb_build_object(
            'name', 'synthetic signed LOS trend scenario',
            'method', 'predefined synthetic values for pipeline bootstrap',
            'trained_on_real_data', false
        ),
        'product_context', jsonb_build_object(
            'mission', 'NASA-ISRO NISAR',
            'intended_product', 'L2 GUNW',
            'frequency_character', 'A',
            'polarization', 'HH',
            'geocoded_posting_m', 80,
            'nominal_repeat_days', 12,
            'actual_granule_used', false,
            'specification_reference', 'https://nisar-docs.asf.alaska.edu/gunw/'
        ),
        'source_context', jsonb_build_object(
            'official_data_downloaded', false,
            'official_granule_ids', jsonb_build_array(),
            'department_code_reference', 'DANE DIVIPOLA',
            'department_code_reference_url', 'https://geoportal.dane.gov.co/descargas/mmra/MMRA2023_Catalogo_Objetos.pdf'
        ),
        'limitations', jsonb_build_array(
            'All observations, phase, coherence and forecasts are synthetic and are not ASF or NISAR measurements.',
            'Signed line-of-sight displacement is not slope-parallel movement and does not by itself establish landslide risk.',
            'The illustrative interval and scenario have not been calibrated or validated against real scenes or field data.'
        )
    )
FROM forecasts AS f
ON CONFLICT (run_id, prediction_key) DO UPDATE
    SET model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        predicted_at = EXCLUDED.predicted_at,
        payload = EXCLUDED.payload;

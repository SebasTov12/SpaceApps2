CREATE TABLE IF NOT EXISTS analysis.model_training_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id text NOT NULL,
    source text NOT NULL CHECK (source IN ('DIAN', 'NASA-ISRO NISAR')),
    model_name text NOT NULL,
    model_version text NOT NULL,
    run_id text NOT NULL,
    training_start date NOT NULL,
    training_end date NOT NULL,
    sample_count integer NOT NULL CHECK (sample_count >= 2),
    synthetic boolean NOT NULL,
    coefficients jsonb NOT NULL,
    metrics jsonb NOT NULL,
    trained_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT model_training_runs_case_source_run_unique
        UNIQUE (case_id, source, run_id)
);

REVOKE ALL ON TABLE analysis.model_training_runs FROM PUBLIC;

CREATE OR REPLACE FUNCTION analysis.train_colombia_synthetic_models()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
    v_run_id constant text := 'synthetic-linear-trend-v1';
    v_dian record;
    v_nasa record;
    v_dian_forecast numeric;
    v_dian_mae numeric;
    v_dian_next_month date;
    v_nasa_forecast numeric;
    v_nasa_mae numeric;
    v_nasa_next_month date;
BEGIN
    WITH ordered AS (
        SELECT
            (p.payload #>> '{period,start}')::date AS period_start,
            (p.payload #>> '{forecast,value}')::double precision AS value,
            (row_number() OVER (
                ORDER BY (p.payload #>> '{period,start}')::date
            ) - 1)::double precision AS month_index
        FROM dian.predictions AS p
        WHERE p.model_name = 'dian_tax_collection_synthetic_scenario'
          AND p.payload ->> 'synthetic' = 'true'
          AND p.payload #>> '{geography,scope_level}' = 'national'
    ), fit AS (
        SELECT
            regr_slope(value, month_index) AS slope,
            regr_intercept(value, month_index) AS intercept,
            regr_r2(value, month_index) AS r_squared,
            count(*)::integer AS sample_count,
            min(period_start) AS training_start,
            max(period_start) AS training_end
        FROM ordered
    )
    SELECT
        fit.slope,
        fit.intercept,
        fit.r_squared,
        fit.sample_count,
        fit.training_start,
        fit.training_end,
        avg(abs(ordered.value - (fit.intercept + fit.slope * ordered.month_index))) AS mae,
        (array_agg(ordered.value ORDER BY ordered.month_index DESC))[1] AS last_value
    INTO v_dian
    FROM fit
    CROSS JOIN ordered
    GROUP BY
        fit.slope,
        fit.intercept,
        fit.r_squared,
        fit.sample_count,
        fit.training_start,
        fit.training_end;

    IF v_dian.sample_count IS NULL OR v_dian.sample_count < 3 THEN
        RAISE EXCEPTION 'DIAN necesita al menos tres predicciones sintéticas de entrenamiento';
    END IF;

    WITH ordered AS (
        SELECT
            (p.payload #>> '{period,start}')::date AS period_start,
            (p.payload #>> '{forecast,value}')::double precision AS value,
            (p.payload #>> '{features,mean_coherence}')::double precision AS mean_coherence,
            (row_number() OVER (
                ORDER BY (p.payload #>> '{period,start}')::date
            ) - 1)::double precision AS month_index
        FROM nasa.predictions AS p
        WHERE p.model_name = 'nisar_gunw_synthetic_los_scenario'
          AND p.payload ->> 'synthetic' = 'true'
          AND p.payload #>> '{geography,site_id}' = 'colombia-ladera'
    ), fit AS (
        SELECT
            regr_slope(value, month_index) AS slope,
            regr_intercept(value, month_index) AS intercept,
            regr_r2(value, month_index) AS r_squared,
            count(*)::integer AS sample_count,
            min(period_start) AS training_start,
            max(period_start) AS training_end
        FROM ordered
    )
    SELECT
        fit.slope,
        fit.intercept,
        fit.r_squared,
        fit.sample_count,
        fit.training_start,
        fit.training_end,
        avg(abs(ordered.value - (fit.intercept + fit.slope * ordered.month_index))) AS mae,
        (array_agg(ordered.value ORDER BY ordered.month_index DESC))[1] AS last_value,
        avg(ordered.mean_coherence) AS mean_coherence
    INTO v_nasa
    FROM fit
    CROSS JOIN ordered
    GROUP BY
        fit.slope,
        fit.intercept,
        fit.r_squared,
        fit.sample_count,
        fit.training_start,
        fit.training_end;

    IF v_nasa.sample_count IS NULL OR v_nasa.sample_count < 3 THEN
        RAISE EXCEPTION 'NISAR necesita al menos tres predicciones sintéticas de entrenamiento';
    END IF;

    v_dian_forecast := round((v_dian.intercept + v_dian.slope * v_dian.sample_count)::numeric, 0);
    v_dian_mae := greatest(round(coalesce(v_dian.mae, 0)::numeric, 0), 0);
    v_dian_next_month := (v_dian.training_end + INTERVAL '1 month')::date;

    v_nasa_forecast := round((v_nasa.intercept + v_nasa.slope * v_nasa.sample_count)::numeric, 3);
    v_nasa_mae := greatest(round(coalesce(v_nasa.mae, 0)::numeric, 3), 0);
    v_nasa_next_month := (v_nasa.training_end + INTERVAL '1 month')::date;

    INSERT INTO analysis.model_training_runs (
        case_id, source, model_name, model_version, run_id,
        training_start, training_end, sample_count, synthetic, coefficients, metrics, trained_at
    ) VALUES (
        'colombia-ladera', 'DIAN', 'monthly_tax_collection_linear_regression', 'ols-v1', v_run_id,
        v_dian.training_start, v_dian.training_end, v_dian.sample_count, true,
        jsonb_build_object(
            'intercept', v_dian.intercept,
            'slope_per_month', v_dian.slope,
            'feature', 'month_index'
        ),
        jsonb_build_object(
            'r_squared', v_dian.r_squared,
            'mae_cop', v_dian.mae,
            'sample_count', v_dian.sample_count,
            'evaluation_scope', 'in_sample',
            'training_series', 'synthetic scenario values'
        ),
        now()
    )
    ON CONFLICT (case_id, source, run_id) DO UPDATE
        SET training_start = EXCLUDED.training_start,
            training_end = EXCLUDED.training_end,
            sample_count = EXCLUDED.sample_count,
            coefficients = EXCLUDED.coefficients,
            metrics = EXCLUDED.metrics,
            trained_at = EXCLUDED.trained_at;

    INSERT INTO analysis.model_training_runs (
        case_id, source, model_name, model_version, run_id,
        training_start, training_end, sample_count, synthetic, coefficients, metrics, trained_at
    ) VALUES (
        'colombia-ladera', 'NASA-ISRO NISAR', 'monthly_signed_los_linear_regression', 'ols-v1', v_run_id,
        v_nasa.training_start, v_nasa.training_end, v_nasa.sample_count, true,
        jsonb_build_object(
            'intercept', v_nasa.intercept,
            'slope_per_month', v_nasa.slope,
            'feature', 'month_index'
        ),
        jsonb_build_object(
            'r_squared', v_nasa.r_squared,
            'mae_mm', v_nasa.mae,
            'sample_count', v_nasa.sample_count,
            'mean_synthetic_coherence', v_nasa.mean_coherence,
            'evaluation_scope', 'in_sample',
            'training_series', 'synthetic scenario values'
        ),
        now()
    )
    ON CONFLICT (case_id, source, run_id) DO UPDATE
        SET training_start = EXCLUDED.training_start,
            training_end = EXCLUDED.training_end,
            sample_count = EXCLUDED.sample_count,
            coefficients = EXCLUDED.coefficients,
            metrics = EXCLUDED.metrics,
            trained_at = EXCLUDED.trained_at;

    INSERT INTO dian.predictions (
        model_name, model_version, run_id, prediction_key, predicted_at, payload
    ) VALUES (
        'dian_monthly_tax_collection_linear_regression',
        'ols-v1',
        v_run_id,
        'CO-national-' || to_char(v_dian_next_month, 'YYYY-MM'),
        now(),
        jsonb_build_object(
            'synthetic', true,
            'data_origin', 'model_trained_on_synthetic_scenario_values',
            'geography', jsonb_build_object(
                'country_code', 'CO', 'country_name', 'Colombia', 'scope_level', 'national'
            ),
            'period', jsonb_build_object(
                'start', to_char(v_dian_next_month, 'YYYY-MM-DD'),
                'end', to_char((v_dian_next_month + INTERVAL '1 month - 1 day')::date, 'YYYY-MM-DD'),
                'granularity', 'month'
            ),
            'forecast', jsonb_build_object(
                'target', 'monthly_gross_tax_collection',
                'value', v_dian_forecast,
                'unit', 'COP',
                'illustrative_mae_band', jsonb_build_object(
                    'lower', greatest(v_dian_forecast - v_dian_mae, 0),
                    'upper', v_dian_forecast + v_dian_mae,
                    'calibrated', false
                )
            ),
            'baseline', jsonb_build_object(
                'previous_value', v_dian.last_value,
                'unit', 'COP',
                'comparison', 'last synthetic training month'
            ),
            'components', jsonb_build_array(
                jsonb_build_object('tax_type', 'IVA', 'value', round(v_dian_forecast * 0.33), 'unit', 'COP', 'share_synthetic', true),
                jsonb_build_object('tax_type', 'renta', 'value', round(v_dian_forecast * 0.42), 'unit', 'COP', 'share_synthetic', true),
                jsonb_build_object('tax_type', 'retencion_en_la_fuente', 'value', round(v_dian_forecast * 0.25), 'unit', 'COP', 'share_synthetic', true)
            ),
            'model_context', jsonb_build_object(
                'training_status', 'trained',
                'model_name', 'monthly_tax_collection_linear_regression',
                'algorithm', 'ordinary_least_squares',
                'training_run_id', v_run_id,
                'training_start', v_dian.training_start,
                'training_end', v_dian.training_end,
                'training_sample_count', v_dian.sample_count,
                'coefficients', jsonb_build_object('intercept', v_dian.intercept, 'slope_per_month', v_dian.slope),
                'metrics', jsonb_build_object('r_squared', v_dian.r_squared, 'mae_cop', v_dian.mae),
                'evaluation_scope', 'in_sample',
                'predictors', jsonb_build_array('month_index'),
                'trained_on_real_data', false,
                'forecast_horizon_months', 1
            ),
            'source_context', jsonb_build_object(
                'official_reference', 'https://www.dian.gov.co/dian/cifras/Paginas/EstadisticasRecaudo.aspx',
                'official_data_downloaded', false,
                'scope_warning', 'National series is not a measure of the pilot AOI.'
            ),
            'limitations', jsonb_build_array(
                'The model was trained only on six synthetic scenario values, not DIAN observations.',
                'The one-step trend and MAE band are illustrative and are not calibrated.',
                'This national forecast cannot be attributed to Norte de Santander.'
            )
        )
    )
    ON CONFLICT (run_id, prediction_key) DO UPDATE
        SET predicted_at = EXCLUDED.predicted_at,
            payload = EXCLUDED.payload;

    INSERT INTO nasa.predictions (
        model_name, model_version, run_id, prediction_key, predicted_at, payload
    ) VALUES (
        'nisar_monthly_signed_los_linear_regression',
        'ols-v1',
        v_run_id,
        'CO-54-colombia-ladera-' || to_char(v_nasa_next_month, 'YYYY-MM'),
        now(),
        jsonb_build_object(
            'synthetic', true,
            'data_origin', 'model_trained_on_synthetic_scenario_values',
            'geography', jsonb_build_object(
                'country_code', 'CO', 'department_code', '54',
                'department_name', 'Norte de Santander', 'site_id', 'colombia-ladera',
                'scope_level', 'site_aoi',
                'bbox_wgs84', jsonb_build_array(-72.56, 7.82, -72.44, 7.94),
                'center_wgs84', jsonb_build_object('latitude', 7.88, 'longitude', -72.50)
            ),
            'period', jsonb_build_object(
                'start', to_char(v_nasa_next_month, 'YYYY-MM-DD'),
                'end', to_char((v_nasa_next_month + INTERVAL '1 month - 1 day')::date, 'YYYY-MM-DD'),
                'granularity', 'month'
            ),
            'forecast', jsonb_build_object(
                'target', 'monthly_mean_signed_line_of_sight_displacement',
                'value', v_nasa_forecast,
                'unit', 'mm',
                'illustrative_mae_band', jsonb_build_object(
                    'lower', v_nasa_forecast - v_nasa_mae,
                    'upper', v_nasa_forecast + v_nasa_mae,
                    'calibrated', false
                )
            ),
            'baseline', jsonb_build_object(
                'previous_value', v_nasa.last_value,
                'unit', 'mm',
                'comparison', 'last synthetic training month'
            ),
            'features', jsonb_build_object(
                'mean_synthetic_coherence', v_nasa.mean_coherence,
                'nominal_acquisition_interval_days', 12,
                'synthetic_unwrapped_phase_rad', round((-4 * pi() * (v_nasa_forecast / 1000.0) / 0.2384)::numeric, 6),
                'wavelength_m', 0.2384
            ),
            'model_context', jsonb_build_object(
                'training_status', 'trained',
                'model_name', 'monthly_signed_los_linear_regression',
                'algorithm', 'ordinary_least_squares',
                'training_run_id', v_run_id,
                'training_start', v_nasa.training_start,
                'training_end', v_nasa.training_end,
                'training_sample_count', v_nasa.sample_count,
                'coefficients', jsonb_build_object('intercept', v_nasa.intercept, 'slope_per_month', v_nasa.slope),
                'metrics', jsonb_build_object('r_squared', v_nasa.r_squared, 'mae_mm', v_nasa.mae),
                'evaluation_scope', 'in_sample',
                'predictors', jsonb_build_array('month_index'),
                'trained_on_real_data', false,
                'forecast_horizon_months', 1
            ),
            'product_context', jsonb_build_object(
                'mission', 'NASA-ISRO NISAR', 'intended_product', 'L2 GUNW',
                'frequency_character', 'A', 'polarization', 'HH',
                'geocoded_posting_m', 80, 'nominal_repeat_days', 12,
                'actual_granule_used', false,
                'specification_reference', 'https://nisar-docs.asf.alaska.edu/gunw/'
            ),
            'limitations', jsonb_build_array(
                'The model was trained only on six synthetic scenario values, not NISAR observations.',
                'The one-step trend and MAE band are illustrative and are not calibrated.',
                'Signed LOS displacement is not slope-parallel movement and does not itself establish landslide risk.'
            )
        )
    )
    ON CONFLICT (run_id, prediction_key) DO UPDATE
        SET predicted_at = EXCLUDED.predicted_at,
            payload = EXCLUDED.payload;

    PERFORM analysis.refresh_colombia_llm_briefs();
    RETURN 2;
END;
$function$;

REVOKE ALL ON FUNCTION analysis.train_colombia_synthetic_models() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analysis.train_colombia_synthetic_models() TO spaceapps2_admin;

SELECT analysis.train_colombia_synthetic_models() AS trained_models;

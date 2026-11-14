-- Idempotencia para las cargas del mismo modelo y predicción.
CREATE UNIQUE INDEX IF NOT EXISTS dian_predictions_run_key_idx
    ON dian.predictions (run_id, prediction_key);

CREATE UNIQUE INDEX IF NOT EXISTS nasa_predictions_run_key_idx
    ON nasa.predictions (run_id, prediction_key);

CREATE INDEX IF NOT EXISTS dian_predictions_period_idx
    ON dian.predictions ((payload #>> '{period,start}'));

CREATE INDEX IF NOT EXISTS nasa_predictions_period_idx
    ON nasa.predictions ((payload #>> '{period,start}'));

CREATE SCHEMA IF NOT EXISTS analysis;
REVOKE ALL ON SCHEMA analysis FROM PUBLIC;

CREATE TABLE IF NOT EXISTS analysis.llm_briefs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    case_id text NOT NULL,
    period_start date NOT NULL,
    run_id text NOT NULL,
    payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
    generated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT llm_briefs_case_period_unique UNIQUE (case_id, period_start)
);

CREATE OR REPLACE FUNCTION analysis.synthesize_colombia_month(p_period date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $function$
DECLARE
    v_month date := date_trunc('month', p_period)::date;
    v_dian_record jsonb;
    v_nasa_record jsonb;
    v_dian jsonb;
    v_nasa jsonb;
    v_dian_value numeric;
    v_dian_previous numeric;
    v_dian_change_pct numeric;
    v_dian_trend text;
    v_nasa_value numeric;
    v_nasa_previous numeric;
    v_nasa_change_mm numeric;
    v_nasa_trend text;
    v_dian_synthetic boolean;
    v_nasa_synthetic boolean;
    v_contains_synthetic boolean;
    v_all_synthetic boolean;
BEGIN
    SELECT jsonb_build_object(
               'model_name', p.model_name,
               'model_version', p.model_version,
               'run_id', p.run_id,
               'prediction_key', p.prediction_key,
               'predicted_at', p.predicted_at,
               'payload', p.payload
           )
      INTO v_dian_record
      FROM dian.predictions AS p
     WHERE p.payload #>> '{period,start}' = to_char(v_month, 'YYYY-MM-DD')
       AND p.payload #>> '{geography,country_code}' = 'CO'
       AND p.payload #>> '{geography,scope_level}' = 'national'
     ORDER BY p.predicted_at DESC, p.id DESC
     LIMIT 1;

    SELECT jsonb_build_object(
               'model_name', p.model_name,
               'model_version', p.model_version,
               'run_id', p.run_id,
               'prediction_key', p.prediction_key,
               'predicted_at', p.predicted_at,
               'payload', p.payload
           )
      INTO v_nasa_record
      FROM nasa.predictions AS p
     WHERE p.payload #>> '{period,start}' = to_char(v_month, 'YYYY-MM-DD')
       AND p.payload #>> '{geography,country_code}' = 'CO'
       AND p.payload #>> '{geography,site_id}' = 'colombia-ladera'
     ORDER BY p.predicted_at DESC, p.id DESC
     LIMIT 1;

    IF v_dian_record IS NULL OR v_nasa_record IS NULL THEN
        RAISE EXCEPTION 'Se necesitan predicciones DIAN y NASA para %', v_month;
    END IF;

    v_dian := v_dian_record -> 'payload';
    v_nasa := v_nasa_record -> 'payload';
    v_dian_synthetic := coalesce((v_dian ->> 'synthetic')::boolean, false);
    v_nasa_synthetic := coalesce((v_nasa ->> 'synthetic')::boolean, false);
    v_contains_synthetic := v_dian_synthetic OR v_nasa_synthetic;
    v_all_synthetic := v_dian_synthetic AND v_nasa_synthetic;

    v_dian_value := (v_dian #>> '{forecast,value}')::numeric;
    v_dian_previous := (v_dian #>> '{baseline,previous_value}')::numeric;
    v_dian_change_pct := CASE
        WHEN v_dian_previous = 0 THEN NULL
        ELSE round((v_dian_value - v_dian_previous) / abs(v_dian_previous) * 100, 2)
    END;
    v_dian_trend := CASE
        WHEN v_dian_change_pct IS NULL THEN 'sin_base_comparable'
        WHEN v_dian_change_pct > 0 THEN 'aumento'
        WHEN v_dian_change_pct < 0 THEN 'disminucion'
        ELSE 'estable'
    END;

    v_nasa_value := (v_nasa #>> '{forecast,value}')::numeric;
    v_nasa_previous := (v_nasa #>> '{baseline,previous_value}')::numeric;
    v_nasa_change_mm := CASE
        WHEN v_nasa_previous IS NULL THEN NULL
        ELSE round(v_nasa_value - v_nasa_previous, 3)
    END;
    v_nasa_trend := CASE
        WHEN v_nasa_change_mm IS NULL THEN 'sin_base_comparable'
        WHEN v_nasa_change_mm > 0 THEN 'aumento_del_desplazamiento_LOS_con_signo'
        WHEN v_nasa_change_mm < 0 THEN 'disminucion_del_desplazamiento_LOS_con_signo'
        ELSE 'estable'
    END;

    RETURN jsonb_build_object(
        'schema_version', '1.0',
        'brief_id', 'CO-54-colombia-ladera-' || to_char(v_month, 'YYYY-MM'),
        'generated_at', now(),
        'synthetic', v_all_synthetic,
        'contains_synthetic_records', v_contains_synthetic,
        'case', jsonb_build_object(
            'site_id', 'colombia-ladera',
            'country_code', 'CO',
            'department_code', '54',
            'department', 'Norte de Santander',
            'period', to_char(v_month, 'YYYY-MM')
        ),
        'evidence', jsonb_build_array(
            jsonb_build_object(
                'source', 'DIAN',
                'synthetic', v_dian_synthetic,
                'model', jsonb_build_object(
                    'name', v_dian_record ->> 'model_name',
                    'version', v_dian_record ->> 'model_version',
                    'run_id', v_dian_record ->> 'run_id',
                    'prediction_key', v_dian_record ->> 'prediction_key'
                ),
                'geography', v_dian -> 'geography',
                'period', v_dian -> 'period',
                'forecast', v_dian -> 'forecast',
                'baseline', v_dian -> 'baseline',
                'model_context', v_dian -> 'model_context',
                'analysis', jsonb_build_object(
                    'month_over_month_change_pct', v_dian_change_pct,
                    'direction', v_dian_trend
                ),
                'components', v_dian -> 'components',
                'source_context', v_dian -> 'source_context',
                'limitations', v_dian -> 'limitations'
            ),
            jsonb_build_object(
                'source', 'NASA-ISRO NISAR',
                'synthetic', v_nasa_synthetic,
                'model', jsonb_build_object(
                    'name', v_nasa_record ->> 'model_name',
                    'version', v_nasa_record ->> 'model_version',
                    'run_id', v_nasa_record ->> 'run_id',
                    'prediction_key', v_nasa_record ->> 'prediction_key'
                ),
                'geography', v_nasa -> 'geography',
                'period', v_nasa -> 'period',
                'forecast', v_nasa -> 'forecast',
                'baseline', v_nasa -> 'baseline',
                'model_context', v_nasa -> 'model_context',
                'analysis', jsonb_build_object(
                    'signed_los_change_mm', v_nasa_change_mm,
                    'direction', v_nasa_trend
                ),
                'features', v_nasa -> 'features',
                'product_context', v_nasa -> 'product_context',
                'source_context', v_nasa -> 'source_context',
                'limitations', v_nasa -> 'limitations'
            )
        ),
        'synthesis', jsonb_build_object(
            'dian_collection_change_pct', v_dian_change_pct,
            'dian_collection_direction', v_dian_trend,
            'nisar_signed_los_change_mm', v_nasa_change_mm,
            'nisar_signed_los_direction', v_nasa_trend,
            'temporal_periods_aligned', true,
            'spatial_scopes_comparable',
                (v_dian #>> '{geography,scope_level}' = v_nasa #>> '{geography,scope_level}'),
            'cross_source_correlation_estimated', false,
            'predictive_models_trained', coalesce(
                v_dian #>> '{model_context,training_status}' = 'trained'
                AND v_nasa #>> '{model_context,training_status}' = 'trained',
                false
            ),
            'combined_risk_score', NULL,
            'alert', false,
            'interpretation',
                'Presenta las tendencias por separado. El alcance nacional DIAN no representa la actividad económica del área piloto. El desplazamiento LOS sintético no valida una amenaza ni establece causalidad.'
        ),
        'llm_request', jsonb_build_object(
            'provider', NULL,
            'system_prompt',
                'Resume evidencia territorial en español usando solo el paquete recibido. Distingue predicciones de observaciones y conserva la marca sintética de cada fuente. Mantén separados los alcances geográficos y las unidades. No infieras causalidad entre recaudo y desplazamiento, no calcules riesgo conjunto, no emitas alertas y no inventes datos ausentes. Menciona las limitaciones de cada fuente.',
            'user_instruction',
                'Redacta un resumen breve con una sección por fuente, el cambio calculado frente a la base inmediata y una nota explícita sobre la diferencia entre el alcance nacional de DIAN y el AOI satelital de Norte de Santander. Identifica cuáles cifras son sintéticas.'
        )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION analysis.refresh_colombia_llm_briefs()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $function$
DECLARE
    v_period date;
    v_payload jsonb;
    v_written integer := 0;
BEGIN
    FOR v_period IN
        SELECT DISTINCT (d.payload #>> '{period,start}')::date
          FROM dian.predictions AS d
          JOIN nasa.predictions AS n
            ON n.payload #>> '{period,start}' = d.payload #>> '{period,start}'
         WHERE d.payload #>> '{geography,country_code}' = 'CO'
           AND n.payload #>> '{geography,country_code}' = 'CO'
           AND n.payload #>> '{geography,site_id}' = 'colombia-ladera'
         ORDER BY 1
    LOOP
        v_payload := analysis.synthesize_colombia_month(v_period);

        INSERT INTO analysis.llm_briefs (case_id, period_start, run_id, payload)
        VALUES (
            'colombia-ladera',
            v_period,
            'synthesis-colombia-ladera-' || to_char(v_period, 'YYYYMM'),
            v_payload
        )
        ON CONFLICT (case_id, period_start) DO UPDATE
            SET run_id = EXCLUDED.run_id,
                payload = EXCLUDED.payload,
                generated_at = now();

        v_written := v_written + 1;
    END LOOP;

    RETURN v_written;
END;
$function$;

REVOKE ALL ON TABLE analysis.llm_briefs FROM PUBLIC;
REVOKE ALL ON FUNCTION analysis.synthesize_colombia_month(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION analysis.refresh_colombia_llm_briefs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION analysis.synthesize_colombia_month(date) TO spaceapps2_admin;
GRANT EXECUTE ON FUNCTION analysis.refresh_colombia_llm_briefs() TO spaceapps2_admin;

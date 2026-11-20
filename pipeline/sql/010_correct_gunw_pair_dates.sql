-- Correct GUNW acquisition-pair dates parsed from the ASF granule identifier.
-- GUNW identifiers contain four acquisition timestamps in order:
-- reference start, reference stop, secondary start, secondary stop.
-- Older catalog imports mistakenly used timestamps 1 and 2, so both dates
-- pointed at the reference acquisition.
BEGIN;

UPDATE nisar.catalog_assets
   SET reference_date = to_date(left(split_part(granule_name, '_', 12), 8), 'YYYYMMDD'),
       secondary_date = to_date(left(split_part(granule_name, '_', 14), 8), 'YYYYMMDD')
 WHERE processing_level = 'GUNW'
   AND granule_name LIKE 'NISAR_L2_%_GUNW_%'
   AND split_part(granule_name, '_', 12) ~ '^20[0-9]{6}T[0-9]{6}$'
   AND split_part(granule_name, '_', 14) ~ '^20[0-9]{6}T[0-9]{6}$'
   AND (
       reference_date IS DISTINCT FROM to_date(left(split_part(granule_name, '_', 12), 8), 'YYYYMMDD')
       OR secondary_date IS DISTINCT FROM to_date(left(split_part(granule_name, '_', 14), 8), 'YYYYMMDD')
   );

COMMIT;

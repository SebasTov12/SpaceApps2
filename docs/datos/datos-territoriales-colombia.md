# Datos territoriales de Colombia

El proceso scripts/ingest_colombia_territorial.py prepara perfiles municipales nacionales a partir de fuentes públicas. Asocia geometría generalizada con código DIVIPOLA y conserva procedencia, fecha de consulta y cobertura.

## Fuentes y uso

| Fuente | Variables | Escala y consideración |
|---|---|---|
| DANE MGN y CNPV 2018 | Población, hogares, viviendas y unidades no residenciales | Municipal; referencia censal histórica |
| DANE | Déficit habitacional e índice de pobreza multidimensional | Indicadores agregados municipales |
| REPS | Sedes de prestadores de salud | Conteo por municipio según el corte consultado |
| DANE SISE | Sedes educativas | Disponibilidad dependiente del servicio consultado |
| UPRA EVA 2019–2025 | Área sembrada y cosechada, producción y rendimiento | Municipio, cultivo y periodo |
| INVÍAS / Datos Abiertos | Red vial | Infraestructura para contexto; requiere evaluación espacial para establecer afectación |

Las geometrías municipales se generalizan para representación a escala nacional. No son adecuadas para catastro, ingeniería, delimitación predial ni diseño de rutas de evacuación. Los datos ausentes conservan estado nulo y se acompañan del resultado de ingesta.

## Ejecución

Desde la raíz del repositorio, instala las dependencias de scripts y ejecuta:

    python -m pip install -r scripts/requirements.txt
    python scripts/ingest_colombia_territorial.py

El proceso conserva originales y manifiesto bajo data/raw/territorial-colombia/<corte>/ y genera perfiles en data/processed/territorial-colombia/<corte>/. El manifiesto registra fuentes, fecha, cobertura, conteos y hashes.

## Carga a SAROS

Después de aplicar pipeline/sql/009_colombia_territorial_exposure.sql, envía el manifiesto y el GeoJSON de perfiles con scripts/load_territorial_to_server.py. El cargador admite --dry-run y es idempotente por fuente y DIVIPOLA. Los datos de trabajo bajo data/ están excluidos del repositorio.

La API ofrece perfiles por colección o por DIVIPOLA, además de producción agrícola. Consulta backend/README.md para los contratos y el proceso de carga.

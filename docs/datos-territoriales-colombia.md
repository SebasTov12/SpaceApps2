# Exposición territorial nacional de SAROS

## Qué se incorpora

El pipeline `scripts/ingest_colombia_territorial.py` descarga y prepara un corte nacional, sin AOI limitado a Neiva. Produce un perfil por municipio (DIVIPOLA), con geometría municipal generalizada para visualización a escala nacional, atributos socioeconómicos y procedencia por fuente. La salida está en `data/processed/territorial-colombia/<corte>/colombia_municipal_exposure.geojson`; las copias originales y el manifiesto quedan en `data/raw/territorial-colombia/<corte>/`. `data/` está excluido de Git.

| Capa | Fuente / resolución | Uso y límite |
|---|---|---|
| Población, viviendas, hogares y unidades no residenciales | DANE, MGN integrado con CNPV 2018; municipio | Base censal histórica. Las categorías de unidades no residenciales son conteos de uso, no ingresos ni pérdidas económicas. |
| Déficit habitacional | DANE 2018; municipio | Indicador contextual de vulnerabilidad habitacional, no condición actual de cada vivienda. |
| Índice de pobreza multidimensional (IPM) | DANE 2018; municipio | Vulnerabilidad social agregada. |
| Prestadores de salud | REPS, agrupado por código DIVIPOLA de sede | Conteo por municipio desde el corte que trae la API; no se fabrican coordenadas. |
| Sedes educativas | DANE SISE, puntos | Se descarga si el servicio REST permite acceso desde la máquina; un fallo queda registrado y el campo permanece nulo. |
| Red vial nacional | INVÍAS, geometrías de línea de Datos Abiertos | Infraestructura expuesta; requiere intersección espacial con áreas de amenaza antes de inferir afectación o desvíos. |
| Actividad agrícola | UPRA EVA 2019–2025; municipio, cultivo y periodo | Área sembrada/cosechada, producción y rendimiento; estadística municipal, no polígono de parcela. |

Las geometrías de municipio se generalizan con `maxAllowableOffset=0.002` en EPSG:4326 (aprox. 220 m en el ecuador), suficiente para un mapa país y no para ingeniería o catastro. En PostgreSQL, las líneas INVÍAS se simplifican con tolerancia de 0.0005 grados (aprox. 55 m) y se quita el campo geométrico duplicado de sus propiedades; el GeoJSON fuente completo y su SHA-256 quedan en el snapshot local. Ninguna simplificación sirve para definir rutas seguras. Los valores ausentes no se convierten en cero, salvo conteo de sedes REPS: el archivo fuente nacional está completo y un municipio sin filas tiene conteo cero en ese corte.

## Ejecutar y cargar

```powershell
.venv\Scripts\python.exe scripts\ingest_colombia_territorial.py
```

El comando escribe el corte y un `manifest.json` con fuentes, fecha de consulta, cobertura, filas, tamaños y SHA-256. Las fallas individuales quedan anotadas y la corrida no se declara nacional si el perfil no alcanza al menos 1.000 municipios.

Después de aplicar `pipeline/sql/009_colombia_territorial_exposure.sql`, carga una corrida así:

```powershell
.venv\Scripts\python.exe scripts\load_territorial_to_server.py `
  --manifest data\raw\territorial-colombia\<corte>\manifest.json `
  --profiles data\processed\territorial-colombia\<corte>\colombia_municipal_exposure.geojson
```

El cargador es idempotente por huella de fuente y DIVIPOLA, envía `COPY` por SSH a `spaceapps2-postgres`, y conserva los archivos pesados en el workspace. `--dry-run` prepara el SQL sin conectar. La migración añade `territorial.source_snapshots`, `territorial.municipal_profiles`, `territorial.exposure_features` y `territorial.agricultural_production`.

## Lo que estos datos sí permiten

- Consultar y comparar población, vivienda y vulnerabilidad social a escala municipal.
- Relacionar polígonos municipales con eventos históricos y resultados de cribado NISAR.
- Identificar infraestructura vial y contextualizar la continuidad de accesos.
- Relacionar cultivos y producción agrícola reportados por municipio, año y periodo.
- Construir una priorización explicable con la fecha, escala y fuente de cada variable.

## Lo que todavía no permiten

- Estimar daño vivienda por vivienda, pérdidas monetarias locales ni cultivos exactos afectados.
- Convertir producción histórica en pérdidas futuras sin un modelo y etiquetas de daño.
- Calcular una ruta segura en tiempo real o garantizar evacuación.
- Interpretar el censo de 2018 como población de 2026.
- Afirmar causalidad entre deformación NISAR y un impacto económico observado.

Para resolver esos casos se requieren edificios/viviendas georreferenciados, polígonos de cultivos y datos operacionales de cierres viales y respuesta. EVA agrega actividad productiva municipal, pero no ubica cada parcela ni registra pérdidas por desastre. Las capas actuales son variables de exposición y vulnerabilidad, no etiquetas de entrenamiento para pérdidas futuras.

La API expone los perfiles como GeoJSON en `GET /api/v1/territorial/municipalities`, por DIVIPOLA en `GET /api/v1/territorial/municipalities/<divipola>` y los registros productivos en `GET /api/v1/territorial/agriculture?divipola=<código>&year=<opcional>`.

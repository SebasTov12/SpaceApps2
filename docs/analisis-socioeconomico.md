# Análisis socioeconómico territorial

La selección de una región en el planeta abre el explorador existente. Dentro de él, «Territorio y medios de vida» permite explorar supuestos de exposición sin añadir ventanas ni navegación. Las cinco regiones con datos incluyen inventarios ficticios y tres escenarios; las demás muestran ausencia de evaluación.

## Contrato e integración

`frontend/src/lib/socioeconomic.ts` define `TerritorialAssessment`: identificador regional, modo, fuente, población, viviendas, hectáreas productivas, sectores, consecuencias, revisión preventiva e impactos históricos con fecha y fuente. El componente recibe el identificador de la zona; el adaptador HTTP permite sustituir el catálogo demo por evaluaciones verificadas con ese mismo identificador al configurar el servicio socioeconómico.

Los escenarios aplican una fracción explícita (10%, 30%, 60%) al inventario ficticio. No se derivan de la amplitud radar, no asignan probabilidades y no estiman daños monetarios. La selección de fecha del mapa no modifica estos supuestos: el escenario es independiente de las observaciones.

## Datos pendientes

La vista enlaza la fecha y el valor del punto seleccionado con el análisis territorial. Presenta tres etapas: observación, vulnerabilidad y escenario socioeconómico. El inventario ilustrativo incluye infraestructura, población, viviendas y superficie productiva. Los históricos se muestran cuando existen y tienen un estado vacío explícito.

El contrato incorpora infraestructura, factores y estado de vulnerabilidad, nivel y método de riesgo y fecha de evaluación. `TerritorialImpact` admite una evaluación mediante la propiedad `assessment`: omitirla carga el servicio configurado (o fixtures demo si no hay servicio), pasar `null` indica ausencia de evaluación y pasar un objeto utiliza el registro de la región correspondiente. Los escenarios de exposición siguen siendo hipotéticos incluso con un inventario real.

## Conexión con backend

Configurar `NEXT_PUBLIC_SAROS_API` en `frontend/.env.local` usando `.env.example` como referencia y reiniciar desarrollo; en producción reconstruir el frontend. Es una URL pública, sin claves. El servidor debe permitir CORS para el origen del frontend si se aloja en otro dominio. No se implementó autenticación ni envío de credenciales.

- `GET {base}/api/v1/regions/{zoneId}/assessment`: devuelve directamente un objeto `TerritorialAssessment` en JSON (sin envoltorio).
- `404` o `204`: región sin evaluación. `200`: contrato validado en tiempo de ejecución. Otros estados, JSON inválido o demora mayor de 12 segundos: mensaje de error y reintento.
- Con API configurada no hay sustitución silenciosa por datos demo. Al cambiar de región se cancela la consulta anterior.
- `alerts` es opcional: cada aviso contiene `id`, `issuedAt`, `expiresAt` (ISO 8601 con zona horaria), `severity` (`info`, `watch`, `warning`), `message`, `action` (textos ES/EN) y `source`. Solo se muestran avisos ya emitidos y no vencidos, según el reloj del dispositivo. Son avisos recibidos al consultar la región; no hay notificaciones push ni vigilancia de emergencias en tiempo real.
- `forecast` es opcional: `status` (`unavailable`, `experimental`, `validated`), `horizon`, `uncertainty`, `summary` (textos ES/EN) y `method` (string). La validación declarada corresponde al proveedor; el frontend no valida científicamente el modelo.
- La fuente y el modo (`demo`/`real`) corresponden al inventario. Los escenarios porcentuales siempre son hipotéticos. No se generan avisos a partir de esos porcentajes.

Ejemplo válido inicial: cualquiera de los objetos exportados como `demoAssessments` en `frontend/src/lib/socioeconomic.ts`. El contrato TypeScript es la referencia completa de campos requeridos. Comprobación del adaptador: `node --import tsx --test src/lib/territorial-api.test.ts` desde `frontend`.

Incorporar inventarios georreferenciados y fechados, vulnerabilidad, registros históricos documentados, unidades y cobertura de cada fuente. Los registros históricos quedan vacíos hasta contar con evidencia; no se atribuyen cifras a DIAN u otra entidad sin verificar su origen. Para evaluaciones reales será necesario ampliar el contrato con método, incertidumbre, fecha de evaluación y trazabilidad de las fuentes, así como validar los datos recibidos.

La deformación observada, la exposición y el daño son conceptos distintos. El prototipo no predice terremotos, infertilidad del suelo ni pérdidas económicas. Las alertas operativas y cualquier pronóstico requieren un modelo validado y revisión especializada. Las recomendaciones mostradas orientan una revisión territorial, no decisiones estructurales o de evacuación.

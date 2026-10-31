# 09. Decisiones de arquitectura

## ADR-001: conservar cliente web ligero

**Decisión:** HTML, CSS, JavaScript nativo y PWA como experiencia principal.  
**Motivo:** sigue el stack de Orivia, abre desde enlace/QR y puede ofrecer modo offline.  
**Consecuencia:** visualizaciones y estado se deben mantener modulares y probados en móviles modestos.

## ADR-002: separar procesamiento de la PWA

**Decisión:** análisis SAR y geoprocesamiento se ejecutan en backend.  
**Motivo:** volumen, dependencias científicas, credenciales y reproducibilidad.  
**Consecuencia:** el cliente solo consulta productos derivados aprobados.

## ADR-003: incertidumbre como dato de primera clase

**Decisión:** cada resultado expone calidad, vigencia, evidencia y datos insuficientes.  
**Motivo:** una observación orbital no equivale a una alerta inmediata y la cobertura puede variar.  
**Consecuencia:** no se produce una recomendación de bajo riesgo por ausencia de dato.

## ADR-004: revisión humana para publicación de alto impacto

**Decisión:** el piloto requiere revisión autorizada antes de publicación de recomendaciones de alta urgencia.  
**Motivo:** evitar instrucciones no verificadas en un contexto de seguridad pública.  
**Consecuencia:** el SLA debe incluir disponibilidad de revisión.

## ADR-005: rutas condicionadas a datos locales vigentes

**Decisión:** el motor no dibuja rutas si faltan destino seguro, grafo o estado mínimo.  
**Motivo:** NISAR no contiene por sí solo red vial, cierres ni capacidad de refugios.  
**Consecuencia:** la experiencia ofrece canal oficial en lugar de ruta ficticia.


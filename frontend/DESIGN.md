# Guía de diseño del frontend

Base común para todo el equipo. Antes de crear estilos nuevos, usa lo que ya existe aquí.

## Dónde está cada cosa

| Archivo | Contenido |
|---|---|
| `src/styles/tokens.css` | Colores, escala de texto, radios y movimiento. Única fuente de valores. |
| `src/styles/base.css` | Reset, foco de teclado, marca y etiquetas (`.eyebrow`). |
| `src/styles/components.css` | Estilos de los componentes de `src/components/ui`. |
| `src/styles/motion.css` | Efectos reutilizables: `.lift`, `.spotlight`, `.pulse`, barra de progreso. |
| `src/styles/layout.css` | Contenedor, navegación fija, `.panel`, cabeceras de sección y pie. |
| `src/styles/journey.css` | Recorrido con scroll: globo WebGL, capítulos, satélite e indicador. |
| `src/styles/sections.css` | Sección "Cómo funciona". |
| `src/styles/explorer.css` | Explorador: mapa con paneles flotantes, columna lateral y resumen para decisión. |
| `src/app/globals.css` | Solo importa los archivos anteriores, en orden. |

Si trabajas en una sección nueva (por ejemplo, la ficha de zona), crea su propio `src/styles/<seccion>.css` e impórtalo en `globals.css`.

## Reglas

1. **Nada de colores ni tamaños sueltos.** Usa `var(--color-*)`, `var(--text-*)` y `var(--radius-*)`. Si falta un valor, agrégalo a `tokens.css`.
2. **12 px es el mínimo.** Nunca uses un tamaño por debajo de `--text-xs`.
3. **Todo dato simulado lleva `<Badge tone="demo">`.**
4. **Todo indicador muestra su procedencia** con `<Provenance source date scale limitation />`.
5. **La prioridad nunca depende solo del color.** Acompaña `--color-priority-*` con texto o icono.
6. **Hay que comprobar el móvil (375 px)** sin scroll horizontal, y la navegación con teclado (Tab muestra el anillo de foco).

## Tokens principales

- **Paleta TENUA:** `--color-green` #A8DCC5, `--color-green-soft` #D7EFE4, `--color-sky` #A9D8E8, `--color-tech` #6FAFC9, `--color-white` #F5FAF8, `--color-ink` #244C55. Úsalos para rellenos, iconos y degradados. Para texto de acento usa `--color-accent`, una versión oscurecida que cumple contraste.
- **Sombras:** `--shadow-sm`, `--shadow-md`, `--shadow-lg`. **Radios:** 8 · 12 · 18 · 24 px.
- **Texto:** `--color-text` (principal), `--color-text-secondary`, `--color-text-muted`.
- **Superficies:** `--color-bg` < `--color-surface` < `--color-surface-raised`; `--color-surface-sunken` para mapa y línea de tiempo.
- **Acentos:** `--color-accent` (acción, observación NISAR), `--color-warning` (demo o revisión), `--color-danger`, `--color-info`, `--color-violet`.
- **Texto:** `--text-xs` 12 · `--text-sm` 14 · `--text-base` 16 · `--text-lg` 18 · `--text-xl` 20 · `--text-2xl` 24 · `--text-3xl` 30 px.
- **Fuentes:** Geist (`--font-sans`) para la interfaz; Geist Mono (`--font-mono`) para etiquetas técnicas y datos.

Los tokens también funcionan como utilidades de Tailwind: `text-text-muted`, `bg-surface-raised`, `text-sm`, `rounded-lg`, `font-mono`.

## Componentes base (`@/components/ui`)

```tsx
import { Badge, Button, Card, Provenance } from "@/components/ui";

<Button variant="primary">Ver zona</Button>          // primary | outline | ghost; size sm | md | icon
<Button size="icon" aria-label="Capas"><Layers3 /></Button>
<Card as="article" padding="md">…</Card>             // padding none | sm | md
<Badge tone="demo">Mapa demo</Badge>                 // neutral | accent | warning | danger | demo
<Provenance source="NISAR · demo" date="04 AGO 2026" limitation="Valor ilustrativo" />
```

## Animaciones (`@/components/motion/reveal`)

```tsx
<Reveal>…</Reveal>                     // aparece al entrar en pantalla; once={false} también sale al irse
<Stagger><StaggerItem>…</StaggerItem></Stagger>   // hijos que aparecen uno tras otro
<CountUp value="8,420" />              // cifra que cuenta desde cero
<article className="lift spotlight" onPointerMove={trackSpotlight}>  // se eleva y una luz sigue al cursor
```

- Para que algo entre y salga al montarse y desmontarse (capas del mapa, valores que cambian), usa `AnimatePresence` de framer-motion.
- Hay clases CSS listas en `src/styles/motion.css`: `.lift`, `.spotlight` y `.pulse`.
- `MotionProvider` respeta "reducir movimiento" del sistema. No hace falta hacer nada más.

## Recorrido del globo (`components/journey`)

- `globe-canvas.tsx`: shader WebGL. Recibe en cada fotograma centro, radio, longitud y latitud, más la intensidad de la franja de radar, la retícula, los anillos y el interferograma.
- `globe-journey.tsx`: la función `choreograph(p)` convierte el progreso del scroll (0–1) en ese estado. Para cambiar tiempos, zoom o zona piloto se editan los tramos de esa función y la constante `TARGET`.

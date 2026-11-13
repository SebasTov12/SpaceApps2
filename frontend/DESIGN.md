# Guía de diseño del frontend

Base común para todo el equipo. Antes de crear estilos nuevos, usa lo que ya existe aquí.

## Dónde está cada cosa

| Archivo | Contenido |
|---|---|
| `src/styles/tokens.css` | Colores, escala de texto, radios y movimiento. Única fuente de valores. |
| `src/styles/base.css` | Reset, foco de teclado, marca y etiquetas (`.eyebrow`). |
| `src/styles/components.css` | Estilos de los componentes de `src/components/ui`. |
| `src/styles/hero.css` | Landing con la Tierra y la órbita de NISAR. |
| `src/styles/dashboard.css` | Explorador: panel, métricas, mapa, línea de tiempo y tarjetas. |
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

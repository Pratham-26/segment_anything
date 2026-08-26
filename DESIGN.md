# Design System: Annotation Light Table

Recorded from the built surface (`web/`), not intentions. Direction seed 98f5042f, code-led, chosen via decision round (alternate: "Annotation Light Table").

## World
A dark bench where the image is the only bright thing. Charcoal machine chrome recedes; the current frame sits on a lit glass field; every number that measures something is monospaced. Teal means confirmed/gold; amber means "needs eyes" (llm-only); red means delete/reject.

## Color tokens (`web/style.css :root`)
| Token | Value | Role |
|---|---|---|
| `--bench` | `#14161a` | page ground |
| `--bench-raised` | `#1c1f24` | panels, log surfaces, image placeholder |
| `--ink` | `#e6e2d8` | primary text, active stage fill |
| `--ink-dim` | `#9a968b` | secondary text (≥4.5:1 on bench) |
| `--ink-faint` | `#8a857a` | small labels, ≥4.5:1 on bench |
| `--teal` | `#4cc2a8` | accent: primary buttons, gold/confirmed, focus ring, selection |
| `--red` | `#e05656` | destructive only |
| `--amber` | `#e8a13c` | attention lamps (unreviewed frames) |
| `--hairline` / `--hairline-strong` | ivory @ 14% / 30% | all borders; no other border colors |

Class colors (canvas boxes): 8-hue `CLASS_COLORS` array in `app.js`, assigned per category index; color lives in box strokes and small disc wells, never in text labels (labels are ivory on charcoal chips).

## Type
- Display/UI: **Archivo** 500/600 (Google Fonts), headings 17–26px, tight tracking (-0.01em to -0.015em), stage rail 13px uppercase +0.06em.
- Data/measurements: **JetBrains Mono** 400/600, `tabular-nums` via `.mono` — frame stats, logs, metric tables, coordinate inputs.
- Body: Archivo 15px/1.45. No other sizes; rank is weight and case, not ad-hoc sizes.

## Layout
- Top stage rail (48px) with pipeline stages; active stage = ivory fill, bench text.
- Review tab: 240px translucent tool tray (`backdrop-filter: blur(8px)`) left, lit canvas center (`#editor` centered, max inset 64/96px), filmstrip queue bottom.
- Other tabs: single column, 40px block start, `clamp(20px, 6vw, 80px)` inline padding, 62ch measure for intros.
- Breakpoint 900px: tray wraps horizontal, rail status hides, filmstrip goes static.

## Components
- **Buttons**: `.btn` hairline outline; `.btn-primary` teal fill + bench text; disabled 40% opacity.
- **Frame chips** (filmstrip): 76×57, hairline border; current = ivory border + ring; status lamp 8px disc top-right (amber=llm-only, teal=edited/reviewed).
- **Canvas boxes**: 1.5px category-color stroke, 2.5px selected; label chip = charcoal @85% with 6px color disc + ivory 11px mono; 8px corner handles (charcoal fill, ivory stroke).
- **Log panels**: raised surface, 12.5px mono, 1.7 line height.
- **Empty state**: centered ivory title + dim explanation with the CLI equivalent command in mono.

## Motion
One authored moment: `lamp-on` — a radial backlight warms up under a newly selected frame (0.7s ease-out, `prefers-reduced-motion` disables). Everything else is 0.15s ease-out hover/border transitions. No entrance animations.

## States & browser surface
Themed: `::selection` (teal/bench), `:focus-visible` (2px teal, offset 2), thin scrollbars (`--hairline-strong` thumb). Loading: canvas hidden until image decodes; frame images hold `--bench-raised`. Errors surface inline (`#save-hint`, logs). Demo mode labels itself in the rail ("demo data — no server attached").

## Non-negotiables
- Ivory/teal/amber/red only on charcoal; no gray secondaries (warm-tinted instead).
- Mono only for measurements/data, never as costume.
- One type size per role; hierarchy by weight and case.
- Soft shadows with offset+blur only (`0 12px 40px` on canvas); no flat offset blocks.

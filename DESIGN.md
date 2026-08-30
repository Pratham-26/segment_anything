# Design System: Annotation Light Table

Recorded from the built surface (`web/`), not intentions. Direction seed 98f5042f; rethemed to the user-pinned green/dark world (phosphor green on near-black), extended with the projects home.

## World
A dark bench where the image is the only bright thing. Near-black green-cast chrome recedes; the current frame sits on a lit glass field; every number that measures something is monospaced. Phosphor green means confirmed/gold and carries every primary action; amber means "needs eyes" (llm-only); red means delete/reject.

## Color tokens (`web/style.css :root`)
| Token | Value | Role |
|---|---|---|
| `--bench` | `#0a0d0a` | page ground (near-black, green cast) |
| `--bench-raised` | `#121713` | panels, log surfaces, image placeholder |
| `--ink` | `#e4eae2` | primary text |
| `--ink-dim` | `#a0ab9f` | secondary text (≥4.5:1 on bench) |
| `--ink-faint` | `#8b968a` | small labels, ≥4.5:1 on bench |
| `--green` | `#3ecf8e` | accent: primary buttons, gold/confirmed, focus ring, selection, active stage |
| `--red` | `#e0565b` | destructive only |
| `--amber` | `#e5b054` | attention lamps (unreviewed frames) |
| `--hairline` / `--hairline-strong` | sage ink @ 14% / 30% | all borders; no other border colors |

Class colors (canvas boxes): 8-hue `CLASS_COLORS` array in `app.js` (green leads), assigned per category index; color lives in box strokes and small disc wells, never in text labels (labels are pale sage on near-black chips).

## Type
- Display/UI: **Archivo** 500/600 (Google Fonts), headings 17–26px, tight tracking (-0.01em to -0.015em), stage rail 13px uppercase +0.06em.
- Data/measurements: **JetBrains Mono** 400/600, `tabular-nums` via `.mono` — frame stats, logs, metric tables, coordinate inputs.
- Body: Archivo 15px/1.45. No other sizes; rank is weight and case, not ad-hoc sizes.

## Layout
- Top stage rail (48px): separated Projects home button, then the five pipeline stages in pipeline order, each with a small mono step digit (1–5); active stage = green fill, bench text.
- Projects home: single column; new-project form above a bench-row list (name, stage badge, mono counts); the open project's row turns green. Boot lands on the open project's stage-appropriate tab (review when llm labels exist, ingest otherwise).
- Review tab: 240px translucent tool tray (`backdrop-filter: blur(8px)`) left, lit canvas center (`#editor` centered, max inset 64/96px), filmstrip queue bottom.
- Other tabs: single column, 40px block start, `clamp(20px, 6vw, 80px)` inline padding, 62ch measure for intros.
- Breakpoint 900px: tray wraps horizontal, rail status hides, filmstrip goes static.

## Components
- **Buttons**: `.btn` hairline outline; `.btn-primary` green fill + bench text; disabled 40% opacity.
- **Project rows**: full-width bench rows, hairline-separated (no cards); name 600, stage badge = 11px uppercase chip, counts in mono right-aligned; hover raises surface; open project's name/badge green.
- **Frame chips** (filmstrip): 76×57, hairline border; current = ink border + ring; status lamp 8px disc top-right (amber=llm-only, green=edited/reviewed).
- **Canvas boxes**: 1.5px category-color stroke, 2.5px selected; label chip = bench @85% with 6px color disc + sage 11px mono; 8px corner handles (bench fill, ink stroke).
- **Log panels**: raised surface, 12.5px mono, 1.7 line height.
- **Empty state**: centered ink title + dim explanation with the CLI equivalent command in mono.

## Motion
One authored moment: `lamp-on` — a radial backlight warms up under a newly selected frame (0.7s ease-out, `prefers-reduced-motion` disables). Everything else is 0.15s ease-out hover/border transitions. No entrance animations.

## States & browser surface
Themed: `::selection` (green/bench), `:focus-visible` (2px green, offset 2), thin scrollbars (`--hairline-strong` thumb). Loading: canvas hidden until image decodes; frame images hold `--bench-raised`. Errors surface inline (`#save-hint`, logs). Demo mode labels itself in the rail ("demo data — no server attached").

## Non-negotiables
- Sage/green/amber/red only on near-black green-cast ground; no gray secondaries (green-tinted instead).
- Mono only for measurements/data, never as costume.
- One type size per role; hierarchy by weight and case.
- Soft shadows with offset+blur only (`0 12px 40px` on canvas); no flat offset blocks.

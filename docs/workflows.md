# Workflows: CLI & UI

## Principle
One core library (`core`: ingest, label, review-store, split, train, eval). CLI and UI are both thin wrappers over it, so agents and humans operate on identical state — either can pick up where the other left off. Everything is driven by the on-disk project state, never by in-memory session.

## Project layout (single source of truth)
```
project/
  config.yaml          # query, VLM choice (+ vlms shortlist), RF-DETR variant, min-gold size
  images/              # ingested page images
  annotations/
    llm.coco.json      # raw VLM labels
    gold.coco.json     # hand-corrected labels
  runs/<run_id>/       # checkpoints + metrics reports
```

## Stage-by-stage

### 0. Projects home
- **CLI**: projects are just directories; `sam --project <dir> review` opens one (pass `--projects-root` to change the dir whose subfolders are listed).
- **UI**: the Projects tab lists every project under the root as a row (name, pipeline stage badge, image/box counts); click to open it, or create a new project by name. All API calls are scoped with `?project=`, so switching projects is instant and stateless.
- Exit state: one project open; the stage rail acts on it.

### 1. Ingest (upload / PDF split)
- **CLI**: `sam ingest ./scans/ --project myproj` — recursive glob, PDFs auto-split to page PNGs, dedup by hash
- **UI**: drag-drop zone (files or folders); shows ingest progress + thumbnail grid of what was created
- Exit state: `images/` populated, count reported

### 2. Label (VLM via LiteLLM)
- **CLI**: `sam label --query "every signature" --vlm gemini/gemini-2.0-flash [--limit 100]` — model is any LiteLLM id; responses cached; writes `llm.coco.json`
- **UI**: query box + VLM picker (fetched from LiteLLM model list), cost estimate, live progress; preview overlay of boxes on thumbnails when done
- Exit state: `annotations/llm.coco.json`

### 3. Review → gold
- **CLI**: `sam review --project myproj` starts the local annotation web app and opens it — CLI users get the UI here by design (drawing boxes in a terminal is not a thing). Headless alternative: `sam accept-all` (promote llm→gold unedited) for agents that decide gold isn't needed.
- **UI**: canvas editor — image list sidebar, box draw/resize/delete, class dropdown, "add missed object", keyboard shortcuts; save writes `gold.coco.json` as a parallel subset (never mutates `llm`)
- Exit state: `annotations/gold.coco.json` (+ correction-rate stat computed from diff vs llm)

### 4. Split
- **CLI**: `sam split --val-frac 0.1` — validation = 10% of data (deterministic seed); all gold images are forced into validation, remainder distributed from `llm`; prints resulting counts and guarantees no gold leakage into train
- **UI**: split panel showing gold/llm/train/val counts before & after, one-click apply
- Exit state: split manifest in `project/` (deterministic, seed recorded)

### 5. Train
- **CLI**: `sam train --variant rf-detr-base --epochs 100 [--run-name exp1]` — backgroundable; `sam status` polls; logs stream to `runs/<id>/`
- **UI**: training form (variant dropdown, epochs, image-set confirmation) → run view with loss curve, ETA, cancel button
- Exit state: checkpoint in `runs/<run_id>/`

### 6. Evaluate / report
- **CLI**: `sam eval [--run exp1]` → mAP table printed + written to run dir; `sam corrections` → LLM correction-rate metric; `sam benchmark --vlm gpt-4o [...]` → scores any other VLM against gold
- **UI**: results dashboard — mAP@50/mAP@50:95/per-class AP charts, correction rate, VLM leaderboard table, side-by-side prediction-vs-gold overlays
- Exit state: metrics report in run dir

## Typical end-to-end
- **Agent (CLI)**: `ingest && label && accept-all && split && train && eval` — fully scriptable, zero UI
- **Human (UI)**: upload → label → fix boxes in review → split → train → read dashboard
- **Mixed**: agent labels overnight; human reviews in the morning; agent trains

## Build order suggestion
1. Core library + project/config/state format
2. CLI (agents get value first)
3. Review UI (biggest human win)
4. Training/results UI

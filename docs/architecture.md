# Architecture & file structure

## Language & stack choices

| Decision | Choice | Why |
|---|---|---|
| Language | **Python 3.11+** | LiteLLM, RF-DETR (`rfdetr`), PDF splitting all Python-native |
| LLM access | `litellm` | required |
| Detection/training | `rfdetr` (Roboflow) | required |
| PDF → images | `pypdfium2` | Google's PDFium bindings — fastest Python rasterizer, no system deps (PyMuPDF heavier + AGPL) |
| CLI | `argparse` (stdlib) | ~8 subcommands; no dep needed |
| Backend API | `fastapi` + `uvicorn` | serves the annotation UI + JSON API from the same process as `sam review` |
| Frontend | **vanilla HTML/JS, no framework, no bundler** | one canvas editor page + one results dashboard; a build step buys nothing here |

## File structure
```
segment_anything/
├── AGENTS.md               # agent orientation (exists)
├── questions.md            # open Q&A protocol (exists)
├── pyproject.toml          # package metadata; console_script: sam = sam.cli:main
├── docs/
│   ├── prd.md              # exists
│   ├── state-diagram.md    # exists
│   ├── workflows.md        # exists
│   └── architecture.md     # this file
├── src/sam/
│   ├── cli.py              # argparse entry: ingest|label|review|accept-all|split|train|eval|benchmark|corrections|export|status
│   ├── config.py           # project/config.yaml load/save (query, vlm, variant, val_frac)
│   ├── ingest.py           # copy/hash images, split PDFs → page PNGs
│   ├── label.py            # LiteLLM calls (cached), parse → annotations/llm.coco.json
│   ├── coco.py             # tiny COCO read/write/match helpers shared by everything
│   ├── gold.py             # diff llm vs gold → correction-rate metric
│   ├── split.py            # val = 10% seeded, gold forced in, no leakage
│   ├── train.py            # rfdetr wrapper → runs/<run_id>/
│   ├── evaluate.py         # mAP@50 / @50:95 / per-class AP on validation; VLM-vs-gold benchmark
│   ├── export.py           # project → COCO zip (gold-wins merge; --split → train/valid layout)
│   └── server.py           # FastAPI: static files + REST endpoints over core functions
├── web/
│   ├── index.html          # tabs: Ingest / Label / Review / Train / Results
│   ├── app.js              # state fetch/render + canvas box editor
│   └── style.css
└── tests/
    └── test_*.py           # split leakage rule, COCO roundtrip, correction-rate diff
├── projects/               # on-host project data; bind-mounted as /data in containers
├── docker/
│   ├── annotation.Dockerfile  # CPU image: labeling + review UI service
│   └── train.Dockerfile       # train/eval job container: slim base, CUDA via pip torch wheels
└── docker-compose.yml      # annotation (long-running) + train (profiles: [train], GPU)
```

## Layering rule
`cli.py` and `server.py` may only call `src/sam/*` core functions — no business logic in either. Agents (CLI) and humans (UI) therefore always see identical project state.

## Docker-native
- Two services in `docker-compose.yml`, both bind-mount `./projects:/data`:
  - `annotation` — CPU, LLM labeling + review UI (`docker compose up -d`); LiteLLM keys via optional `.env`
  - `train` — GPU job container, `profiles: [train]`; run on demand: `docker compose run --rm train train --project /data/<proj>`
- Project dir always bind-mounted → all state on host, container disposable
- Train image: torch+CUDA via pip wheels on a slim base; annotation image stays slim

## Build order (from workflows.md)
1. `coco.py`, `config.py`, project scaffold
2. `ingest.py`, `label.py`, `split.py`, `gold.py` + CLI → agents fully functional
3. `server.py` + web review editor
4. `train.py`, `evaluate.py` (incl. VLM-vs-gold benchmark) + results tab

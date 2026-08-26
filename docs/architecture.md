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
│   ├── cli.py              # argparse entry: ingest|label|review|accept-all|split|train|eval|benchmark|corrections|status
│   ├── config.py           # project/config.yaml load/save (query, vlm, variant, val_frac)
│   ├── ingest.py           # copy/hash images, split PDFs → page PNGs
│   ├── label.py            # LiteLLM calls (cached), parse → annotations/llm.coco.json
│   ├── coco.py             # tiny COCO read/write/match helpers shared by everything
│   ├── gold.py             # diff llm vs gold → correction-rate metric
│   ├── split.py            # val = 10% seeded, gold forced in, no leakage
│   ├── train.py            # rfdetr wrapper → runs/<run_id>/
│   ├── evaluate.py         # mAP@50 / @50:95 / per-class AP on validation
│   ├── benchmark.py        # run any VLM on images, score vs gold
│   └── server.py           # FastAPI: static files + REST endpoints over core functions
├── web/
│   ├── index.html          # tabs: Ingest / Label / Review / Train / Results
│   ├── app.js              # state fetch/render + canvas box editor
│   └── style.css
└── tests/
    └── test_*.py           # split leakage rule, COCO roundtrip, correction-rate diff
├── Dockerfile              # python-slim (CPU) / CUDA-torch variant for GPU training
└── docker-compose.yml      # one service; bind-mounted project dir; gpu reserve block
```

## Layering rule
`cli.py` and `server.py` may only call `src/sam/*` core functions — no business logic in either. Agents (CLI) and humans (UI) therefore always see identical project state.

## Docker-native
- Everything runs in the container: `docker compose up` starts the FastAPI UI; same image exposes `sam` CLI (`docker compose run sam ingest ...`) so agents use it too
- Project dir always bind-mounted → all state on host, container disposable
- CPU image by default; GPU via compose gpu-reserve + CUDA torch base tag — same code path

## Build order (from workflows.md)
1. `coco.py`, `config.py`, project scaffold
2. `ingest.py`, `label.py`, `split.py`, `gold.py` + CLI → agents fully functional
3. `server.py` + web review editor
4. `train.py`, `evaluate.py`, `benchmark.py` + results tab

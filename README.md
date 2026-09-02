# segment_anything

Query-driven auto-labeling and detector-training pipeline. You upload images or
PDFs, pick a vision LLM (via [LiteLLM](https://github.com/BerriAI/litellm)) and
describe what to box ("all signatures", "every pedestrian"). The model labels
the dataset. You correct its boxes in a review UI into a parallel **gold**
subset. Then an [RF-DETR](https://github.com/roboflow/rf-detr) model trains on
the full data and evaluates on a gold-based validation set.

```
ingest → label (VLM) → review (gold) → split → train → eval / benchmark
```

## Guarantees

- `llm` annotations are never mutated; corrections go to a parallel `gold` subset.
- Gold images always land in validation, never in training.
- Validation is 10% of the data (deterministic seed).
- All VLM calls go through LiteLLM; the model is your config choice, never hardcoded.
- COCO format everywhere; subsets are `llm` and `gold`.

## Setup

Requires Python 3.11+ and [uv](https://docs.astral.sh/uv/).

```bash
uv sync                     # runtime + dev/test deps
uv sync --extra train       # + torch/rfdetr/pycocotools (GPU training only)
```

Set your LLM provider key, e.g. `export OPENAI_API_KEY=...`.

## Usage

```bash
uv run sam ingest ./my-images            # images/PDFs (files or dirs)
uv run sam label --query "signatures" --vlm gpt-4o
uv run sam review                        # web UI on http://127.0.0.1:8000
uv run sam split                         # 10% val, gold forced into val
uv run sam train --variant rf-detr-nano --epochs 50   # needs --extra train
uv run sam eval <run_name>               # metrics on the val set
uv run sam benchmark --vlm gpt-4o        # score the VLM itself against gold
uv run sam benchmark --vlm gpt-4o,gemini/gemini-2.0-flash --limit 20
                                         # compare VLMs on the same gold sample
uv run sam corrections                   # llm-vs-gold correction stats
uv run sam export                        # COCO zip (gold wins); --split for train/valid layout
```

In the review UI: `d` enters draw mode, `b` returns to browse, click selects a
box, drag moves it, corner handles resize, `Delete` removes, `Esc` deselects.
"Save gold" writes `annotations/gold.coco.json` (never touches `llm.coco.json`).
Without a server attached the UI runs on synthetic demo data.

## Docker

```bash
docker compose up                                            # annotation: labeling + review UI on :8000
docker compose run --rm train train --project /data/myproj   # train/eval GPU job
```

`annotation` is a slim CPU image (no torch/rfdetr); `train` is a GPU job
container with the training stack. Project data is bind-mounted at `/data`.

Exports: `sam export` writes `<project>/exports/<name>.zip` — images plus a
merged `_annotations.coco.json` (gold corrections applied, llm boxes kept
everywhere else). `--split` emits rfdetr's `train/valid` layout using the
project split. `GET /api/export` streams the same zip.

## Project layout

```
myproject/
├── config.yaml              # query, vlm, variant, val_frac
├── images/                  # ingested images (deduped, PDFs rendered)
├── annotations/
│   ├── llm.coco.json        # VLM output — immutable
│   └── gold.coco.json       # human-corrected subset
├── split.json               # train/val image ids (deterministic)
└── runs/<run_name>/         # dataset/, checkpoint, metrics.json
```

Source lives in `src/sam/` (core library + CLI + FastAPI server), UI in `web/`,
tests in `tests/`. Design docs: `docs/prd.md`, `docs/state-diagram.md`,
`docs/workflows.md`.

## Development

```bash
uv run pytest              # Python API/pipeline tests (test_ui.py needs playwright + a built UI)
cd web && npm install && npm run test   # 66 frontend tests (Vitest + Testing Library)
cd web && npm run build    # build the review UI to web/dist (required by sam review)
```

For UI development, run `sam review` and `cd web && npm run dev` side by side;
the Vite dev server proxies `/api` to :8000.

## Production notes

- **API keys**: every VLM call goes through LiteLLM; set the provider key in the
  environment (`OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, �) or in
  a `.env` file. Model ids are always user config (`--vlm`, `config.yaml: vlm`),
  never hardcoded.
- **Multi-model**: `config.yaml: vlms` holds a preferred-model shortlist; the
  Label UI offers it as a picker (free-text LiteLLM ids still work). Compare
  VLMs on one gold sample with `sam benchmark --vlm a,b --limit 20`.
- **Detector runs**: every run writes `runs/<run>/run.json` (variant, epochs,
  status); `sam eval <run>` evaluates with that run's own variant; the Results
  UI lists and compares runs per variant.
- **Limits**: `label`/`benchmark` accept `limit`; the server caps it at 10000.
  Keep `--limit` small when sampling; training cost scales with images � epochs.
- **Robustness**: bad project names, unknown projects, malformed gold payloads
  and out-of-range params return 4xx JSON (never a traceback). VLM calls retry
  on rate limits (1s, 2s backoff) and per-image failures are logged into the
  label summary (`failed_images`) without aborting the run.
- **Serving**: `sam review --host 0.0.0.0 --port 8000` behind a reverse proxy is
  the intended single-user deployment; the UI is static (`web/dist`), so a CDN
  or any static host also works with `VITE`-built assets and the FastAPI server
  (or any implementation of `/api/*`) elsewhere.

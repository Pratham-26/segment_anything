# AGENTS.md

Guidance for AI agents working in this repository across sessions.

## What this project is
Query-driven auto-labeling + detector-training pipeline: user uploads images/PDFs, a user-chosen vision LLM (via LiteLLM) boxes objects per a query, human optionally corrects labels into a parallel **gold** subset, then an RF-DETR model is trained on the full data and evaluated on a gold-based validation set. See `docs/prd.md` for the authoritative product spec.

## How to read this repo
Read in this order when (re-)orienting:
1. `docs/prd.md` — what we're building and why; the source of truth for scope
2. `docs/state-diagram.md` — pipeline states and transitions
3. `docs/workflows.md` — CLI + UI workflows per stage, project on-disk layout, build order
4. `questions.md` — currently open decisions (see protocol below)

Then look at actual code state (`git log`, source tree) before assuming anything is implemented — docs may be ahead of or behind the code.

## Conventions
- Docs live in `docs/`. Update the relevant doc when scope changes — don't let docs drift from decisions made in conversation.
- **questions.md protocol**: agents put open questions there; the owner answers inline; once the answer is incorporated into docs/code, remove that Q&A block. Never delete unanswered questions.
- Key invariants to respect in any implementation:
  - `llm` annotations are never mutated; corrections go to a parallel `gold` subset
  - gold images always end up in validation, never in training
  - validation is 10% of the dataset (deterministic seed); all gold images are forced into validation and never trained on
  - all VLM calls go through LiteLLM; model choice is user config, never hardcoded
  - labeling queries may target multiple classes at once
  - COCO format everywhere; subsets = `llm`, `gold`

## Status
- [x] PRD
- [x] State diagram
- [x] Workflows (CLI + UI)
- [x] Core library (coco, config, ingest, label, gold, split, train, evaluate/benchmark)
- [x] CLI (`sam`) + FastAPI server (`sam review` / `sam.server`)
- [x] Review UI (web/ — canvas box editor, demo-mode fallback)
- [ ] Training/results wiring against real rfdetr (wrappers written, untested on GPU)
- [ ] Dockerfile + docker-compose

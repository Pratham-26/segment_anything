# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegated and already decided in `docs/architecture.md`: FastAPI backend serving the Vite + React + TypeScript + Tailwind review UI with shadcn/ui components (built to `web/dist`); Python CLI (`sam`) over the same core library. Docker-native deployment.

## Users

- **ML practitioners / agents (CLI)**: power users and automated agents who run the pipeline headlessly (`ingest → label → split → train → eval`).
- **Human annotators (UI)**: review VLM-generated bounding boxes and correct them into a parallel "gold" subset; also configure and watch training runs.
- Mixed flow is common: an agent labels overnight, a human reviews in the morning, the agent trains.

## Product Purpose

Query-driven auto-labeling + detector-training pipeline. Users upload images or PDFs (PDFs split into page images), enter a query describing what to box ("all signatures", "every red car"), a user-chosen vision LLM (via LiteLLM) labels boxes, a human optionally fixes them into a gold subset, then an RF-DETR model trains on all data and evaluates on a gold-anchored validation set (10% of data, deterministic seed).

## Positioning

The correction loop: raw VLM labels are never mutated — human fixes live in a parallel gold dataset that simultaneously serves as validation ground truth AND as a benchmark to score any other vision LLM. Correction rate = a direct metric of how good the LLM was.

## Operating Context

- Desktop browser (annotation work needs screen space; canvas box editor)
- Project state lives entirely on disk (`config.yaml`, `images/`, `annotations/*.coco.json`, `runs/`)
- CLI and UI operate on identical project state and can interleave
- Runs locally, often Docker; GPU training in background while user works

## Capabilities and Constraints

- Tabs/surfaces per pipeline stage: Ingest, Label, Review (canvas box editor), Train, Results
- Review UI must support: draw/resize/delete boxes, class dropdown, add missed objects, keyboard shortcuts
- Gold saves as parallel file; llm annotations read-only
- All VLM calls through LiteLLM; model choice is user config
- Metrics shown: mAP@50, mAP@50:95, per-class AP, correction rate, VLM-vs-gold benchmark scores
- Terminology: subsets are `llm` (raw VLM) and `gold` (hand-corrected)

## Brand Commitments

None yet. Name in docs is generic ("segment_anything"); product naming is open.

## Evidence on Hand

- Full PRD, state diagram, workflows, architecture docs under `docs/`
- Working core modules: labeling (LiteLLM + cache + retry), COCO helpers, gold diff/correction-rate
- No real imagery, logos, testimonials, or benchmarks; none may be fabricated

## Product Principles

1. Human time only where machines fail — the review surface exists solely to fix what the VLM got wrong
2. Never mutate raw data — corrections always land in gold, side by side with llm
3. Same state for humans and agents — every UI action has an exact CLI equivalent
4. Trust is measured — correction rate and gold-anchored mAP are first-class outputs

## Accessibility & Inclusion

Standard web accessibility; keyboard-driven annotation editing is a core workflow need (annotators fix hundreds of boxes), not just an a11y feature.

# PRD: segment_anything

Query-driven auto-labeling + detector training pipeline: a vision LLM labels your data, you optionally fix its mistakes, and an RF-DETR model gets trained on the result.

## Problem
Users want object detectors trained on their own images/documents, but manual annotation is the bottleneck. A vision LLM can do the first pass; a human fixes only what's wrong.

## User flow

### 1. Upload
- User uploads a batch of **images or PDFs**
- PDFs are split into per-page images before anything else

### 2. Labeling (vision LLM)
- User enters a **query** describing what they want boxed ("all signatures", "every red car", ...)
- Images are sent to the vision LLM via **LiteLLM**; model choice is entirely user-configurable (any LiteLLM-supported VLM)
- Output: bounding boxes per image → COCO-format dataset (`llm` subset)

### 3. Review (optional) → gold dataset
- User can open the annotation UI to view/edit the LLM's boxes (fix coordinates, classes, add/remove objects)
- Corrected labels are saved as a separate, parallel dataset: the **gold** subset
- Original `llm` subset stays untouched — gold never replaces it, it lives alongside it

### 4. Training
- Training panel: pick RF-DETR variant, confirm image set/classes, start training
- Train on the **full dataset** (llm + gold)

### 5. Validation split rules
- **Validation = 10% of the dataset** (seeded, deterministic)
- All gold images are guaranteed to be inside that 10% — never trained on
- The rest goes to training

### 6. Evaluation & metrics
- Detector metrics on validation (mAP@50, mAP@50:95, per-class AP)
- **Correction rate**: how much the user had to fix in gold → direct measure of how good the LLM was on this data
- Same gold set doubles as a benchmark: run any other vision LLM on the same images and score it against gold

## Success criteria
- End-to-end (upload → PDF split → LLM labels → train → eval) runs on ~1k images/PDFs unattended when review is skipped
- Gold-in-validation rule holds: no gold image leaks into training
- Correction-rate metric reported after every training run

## Key metric
Detector mAP@50 on the gold-based validation set.
Secondary: LLM correction rate (edits per image in gold); VLM benchmark scores vs gold.

## Tech
- LiteLLM for all VLM calls (cached responses)
- COCO format everywhere; subsets = `llm`, `gold`
- Roboflow `rfdetr` package for training
- Annotation UI: canvas box editor over uploaded images

## Risks
- VLM misses objects the query cares about → user catches them in review UI; correction rate makes this visible
- Small gold sets make validation noisy → gold sits inside the 10% validation slice alongside held-out llm data
- VLM API cost at scale → cache responses; local VLM option via LiteLLM

## Open questions
(none — resolved ones live in git history; new ones go to `questions.md`)

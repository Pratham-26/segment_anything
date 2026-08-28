# TODO

## Export

- [x] Make the dataset exportable — `sam export` / `GET /api/export` writes a COCO
  zip (images + merged annotations, gold wins over llm); `--split` emits rfdetr's
  train/valid layout.
  - [ ] Optional: download button for the zip in the review UI (endpoint exists).

## Packaging

- [ ] Light Docker image with only dataset creation + correction (ingest, label,
  review UI) — no torch/rfdetr, for annotation-only machines. The current image
  installs the full runtime; split the Dockerfile or drop the train extra there.
  - Open question in `questions.md`: does "light" keep VLM labeling (litellm)?

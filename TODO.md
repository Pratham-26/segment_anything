# TODO

## Export

- [x] Make the dataset exportable — `sam export` / `GET /api/export` writes a COCO
  zip (images + merged annotations, gold wins over llm); `--split` emits rfdetr's
  train/valid layout.
  - [x] Download button for the zip in the review UI (Results tab).

## Packaging

- [x] Light Docker image with dataset creation + correction (ingest, label,
  review UI), no training packages. Answer: the image already ships exactly this —
  runtime deps are litellm + the web stack; torch/rfdetr stay in the optional
  `train` extra and are never installed in Docker. Documented in README.
  Verified: no heavy packages in the default install path.

# TODO

## Export

- [ ] Make the dataset exportable — e.g. export a project (or a run's materialized
  dataset) as COCO zip for use outside this pipeline.

## Packaging

- [ ] Light Docker image with only dataset creation + correction (ingest, label,
  review UI) — no torch/rfdetr, for annotation-only machines. The current image
  installs the full runtime; split the Dockerfile or drop the train extra there.

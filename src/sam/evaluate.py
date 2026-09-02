"""Evaluate a trained run on the validation split (mAP via pycocotools), and
score any VLM against gold (benchmark).

Note: rfdetr's own training already writes per-epoch val metrics into
runs/<run>/metrics.csv; `eval_run` is the standalone re-check with pycocotools.
"""
import json
from pathlib import Path

from . import coco
from .gold import _by_image, _match


def eval_run(project, run_name):
    """Compute mAP@50 / mAP@50:95 / per-class AP on the validation split.
    Uses rfdetr's own evaluator (same path that produces the training val
    metrics), so results match the values in the run's metrics.csv.
    """
    import os, sys
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    os.environ["PYTHONIOENCODING"] = "utf-8"  # ponytail: rich tables need utf-8 on Windows
    from .train import load_model_for_run  # registry: no model class named here

    project = Path(project)
    run_dir = project / "runs" / run_name
    ckpts = sorted(run_dir.glob("*.pth"))
    pref = next((p for p in ckpts if "best" in p.name and "regular" in p.name), None)
    ckpt = pref or (ckpts[0] if ckpts else None)
    if ckpt is None:
        raise SystemExit(f"no .pth checkpoint in {run_dir}")

    # dataset materialized under the same run
    dataset_dir = run_dir / "dataset"
    if not dataset_dir.exists():
        # fallback: any run dataset present (legacy layout)
        for cand in (project / "runs").glob("*/dataset"):
            dataset_dir = cand; break
    if not dataset_dir.exists():
        raise SystemExit(f"no dataset at {dataset_dir}")

    model = load_model_for_run(run_dir, ckpt)
    raw = model.evaluate(dataset_dir=str(dataset_dir), split="val", num_workers=0)

    # raw keys look like "val/mAP_50", "val/mAP_50_95", "val/AP/<class>"
    per_class = {k.split("/")[-1]: round(float(v), 4) for k, v in raw.items() if k.startswith("val/AP/")}
    result = {
        "map50": round(float(raw.get("val/mAP_50", 0)), 4),
        "map50_95": round(float(raw.get("val/mAP_50_95", 0)), 4),
        "per_class": per_class,
        "_raw": {k: round(float(v), 4) for k, v in raw.items()},
    }
    (run_dir / "metrics.json").write_text(json.dumps(result, indent=2))
    return result


def benchmark_multi(project, models, limit=None):
    """Score several VLMs against the same gold sample (same images, same query).
    Returns {"models": [...], "limit": n, "results": [per-model dicts]} so runs
    are directly comparable."""
    models = list(models)
    if not models:
        raise SystemExit("no models given")
    return {
        "models": models,
        "limit": limit,
        "results": [benchmark(project, model=m, limit=limit) for m in models],
    }


def benchmark(project, model, limit=None):
    """Run a VLM on gold images and score its boxes against gold annotations.
    A match = IoU > 0.5 with the same class name. Reuses the same on-disk cache
    as labeling (image+query+model), so re-benchmarks are free."""
    import json

    from .label import _cache_path, query_vlm, to_px
    from .config import load_config

    project = Path(project)
    query = load_config(project)["query"]
    if not query:
        raise SystemExit("no query set in config.yaml; label first or set one")

    gold = coco.load(project / "annotations" / "gold.coco.json")
    gold_anns = _by_image(gold)
    gold_cat = {c["id"]: c["name"] for c in gold["categories"]}
    images = gold["images"]
    if limit:
        images = images[:limit]

    matched = missed = spurious = 0
    for img in images:
        path = project / "images" / img["file_name"]
        cpath = _cache_path(project, path, model=model, query=query)
        if cpath.exists():
            raw = json.loads(cpath.read_text())
        else:
            raw = query_vlm(path, query=query, model=model)
            cpath.parent.mkdir(parents=True, exist_ok=True)
            cpath.write_text(json.dumps(raw))
        boxes = to_px(raw, img["width"], img["height"])
        fake_pred = [{"bbox": b["bbox"], "category_id": b["label"]} for b in boxes]
        fake_true = [{"bbox": a["bbox"], "category_id": gold_cat[a["category_id"]]}
                     for a in gold_anns.get(img["id"], [])]
        pairs = _match(fake_pred, fake_true)
        same = sum(1 for gi, ti in pairs
                   if fake_pred[gi]["category_id"] == fake_true[ti]["category_id"])
        matched += same
        spurious += len(boxes) - same
        missed += len(fake_true) - same

    return {
        "model": model,
        "images": len(images),
        "matched": matched, "missed": missed, "spurious": spurious,
        "precision": round(matched / (matched + spurious), 4) if matched + spurious else None,
        "recall": round(matched / (matched + missed), 4) if matched + missed else None,
    }

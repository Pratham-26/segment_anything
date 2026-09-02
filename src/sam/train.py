"""Train RF-DETR on the project dataset.

Materializes an rfdetr-ready dataset (train/ + valid/ COCO) from the project
split, then calls the `rfdetr` package. Heavy deps (torch, rfdetr) are imported
lazily so the rest of the CLI works without them.
"""
import json
import shutil
from pathlib import Path

from . import coco

# The single registry of supported detector variants. Every other module must
# ask this module for a model class instead of naming one directly.
VARIANT_NAMES = ("rf-detr-base", "rf-detr-large", "rf-detr-nano")


def available_variants() -> dict:
    """Variant name -> rfdetr model class. Lazy: imports torch + rfdetr."""
    from rfdetr import RFDETRBase, RFDETRLarge, RFDETRNano

    return {"rf-detr-base": RFDETRBase, "rf-detr-large": RFDETRLarge, "rf-detr-nano": RFDETRNano}


def model_cls(variant: str):
    """Model class for a variant name; raises on unknown variants."""
    if variant not in VARIANT_NAMES:
        raise ValueError(f"unknown variant '{variant}'; expected one of {list(VARIANT_NAMES)}")
    return available_variants()[variant]


def write_run_meta(run_dir, **meta):
    """Persist run metadata (variant, epochs, status, counts) as run.json."""
    run_dir = Path(run_dir)
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "run.json"
    existing = {}
    if path.exists():
        try:
            existing = json.loads(path.read_text())
        except Exception:
            pass
    existing.update(meta)
    path.write_text(json.dumps(existing, indent=2))
    return existing


def run_variant(run_dir):
    """Variant recorded for a run, or None for legacy runs without metadata."""
    path = Path(run_dir) / "run.json"
    if not path.exists():
        return None
    try:
        return json.loads(path.read_text()).get("variant")
    except Exception:
        return None


def load_model_for_run(run_dir, checkpoint):
    """Build a model for a run checkpoint. Prefers the variant recorded in
    run.json; legacy runs (no metadata) fall back through the variants, smallest
    first, so old checkpoints keep evaluating."""
    variant = run_variant(run_dir)
    if variant:
        return model_cls(variant).from_checkpoint(str(checkpoint))
    last_err = None
    for v in ("rf-detr-nano", "rf-detr-base", "rf-detr-large"):
        try:
            return model_cls(v).from_checkpoint(str(checkpoint))
        except Exception as e:  # wrong architecture for this checkpoint; try next
            last_err = e
    raise RuntimeError(f"no variant could load checkpoint {checkpoint}: {last_err}")


def materialize_dataset(project, split, dest):
    """Write dest/train/ and dest/valid/ in COCO layout for rfdetr."""
    project = Path(project)
    llm = coco.load(project / "annotations" / "llm.coco.json")
    gold_path = project / "annotations" / "gold.coco.json"
    gold = coco.load(gold_path) if gold_path.exists() else None

    # merged dataset: gold annotations win over llm for images they cover
    gold_by_img = {}
    if gold:
        for a in gold["annotations"]:
            gold_by_img.setdefault(a["image_id"], []).append(a)
    ann_by_img = {}
    for a in llm["annotations"]:
        ann_by_img.setdefault(a["image_id"], []).append(a)

    cats = llm["categories"]
    ids_by_file = {img["file_name"]: img for img in llm["images"]}
    train_ids, val_ids = set(split["train"]), set(split["val"])

    for subset, want in (("train", train_ids), ("valid", val_ids)):
        sub_dir = Path(dest) / subset
        sub_dir.mkdir(parents=True, exist_ok=True)
        out = {"images": [], "annotations": [], "categories": cats}
        aid = 1
        for img in llm["images"]:
            if img["id"] not in want:
                continue
            out["images"].append(img)
            anns = gold_by_img.get(img["id"], ann_by_img.get(img["id"], []))
            for a in anns:
                out["annotations"].append({**a, "id": aid})
                aid += 1
            src = project / "images" / img["file_name"]
            if src.exists():
                shutil.copy2(src, sub_dir / img["file_name"])
        coco.save(sub_dir / "_annotations.coco.json", out)

    return {"train_images": len(train_ids), "val_images": len(val_ids)}


def train(project, variant="rf-detr-base", epochs=100, run_name=None):
    """Train RF-DETR. Returns run dir. Requires torch + rfdetr installed."""
    import os, sys
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    os.environ["PYTHONIOENCODING"] = "utf-8"  # ponytail: rich box-drawing fails on cp1252 Windows console
    model_cls(variant)  # validate before any heavy work

    project = Path(project)
    split_path = project / "split.json"
    if not split_path.exists():  # deterministic; gold must already be saved
        from . import split as split_mod
        split_mod.make_split(project)
    split = json.loads(split_path.read_text())
    run_name = run_name or datetime_dirname()
    run_dir = project / "runs" / run_name
    dest = run_dir / "dataset"
    write_run_meta(run_dir, run=run_name, variant=variant, epochs=epochs, status="running")
    counts = materialize_dataset(project, split, dest)

    classes = {c["name"] for c in coco.load(project / "annotations" / "llm.coco.json")["categories"]}
    model = model_cls(variant)(num_classes=len(classes))

    model.train(
        dataset_dir=str(dest),
        epochs=epochs,
        batch_size=4,
        grad_accum_steps=4,
        output_dir=str(run_dir),
        num_workers=0,  # ponytail: avoids Windows spawn crash; bump if Linux + large data
    )
    write_run_meta(run_dir, run=run_name, variant=variant, epochs=epochs, status="done", **counts)
    return {"run": run_name, "variant": variant, "epochs": epochs, **counts}


def datetime_dirname():
    from datetime import datetime
    return datetime.now().strftime("run_%Y%m%d_%H%M%S")

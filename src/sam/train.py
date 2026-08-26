"""Train RF-DETR on the project dataset.

Materializes an rfdetr-ready dataset (train/ + valid/ COCO) from the project
split, then calls the `rfdetr` package. Heavy deps (torch, rfdetr) are imported
lazily so the rest of the CLI works without them.
"""
import json
import shutil
from pathlib import Path

from . import coco


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
    from rfdetr import RFDETRBase, RFDETRLarge, RFDETRNano  # lazy: heavy

    project = Path(project)
    split = json.loads((project / "split.json").read_text())
    run_name = run_name or datetime_dirname()
    dest = project / "runs" / run_name / "dataset"
    counts = materialize_dataset(project, split, dest)

    classes = {c["name"] for c in coco.load(project / "annotations" / "llm.coco.json")["categories"]}
    models = {"rf-detr-base": RFDETRBase, "rf-detr-large": RFDETRLarge, "rf-detr-nano": RFDETRNano}
    model_cls = models.get(variant, RFDETRBase)
    model = model_cls(num_classes=len(classes))

    model.train(
        dataset_dir=str(dest),
        epochs=epochs,
        batch_size=4,
        grad_accum_steps=4,
        dest_dir=str(project / "runs" / run_name),
    )
    return {"run": run_name, "variant": variant, "epochs": epochs, **counts}


def datetime_dirname():
    from datetime import datetime
    return datetime.now().strftime("run_%Y%m%d_%H%M%S")

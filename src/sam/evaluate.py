"""Evaluate a trained run on the validation split (mAP via pycocotools), and
score any VLM against gold (benchmark)."""
import json
from pathlib import Path

from . import coco
from .gold import _by_image, _match, cat_name

# ponytail: pycocotools imported lazily; if unavailable, mAP eval fails loudly
def eval_run(project, run_name):
    """Compute mAP@50 / mAP@50:95 / per-class AP on the validation split."""
    from pycocotools.coco import COCO
    from pycocotools.cocoeval import COCOeval
    import torch  # noqa: F401  (rfdetr predict needs it)

    from rfdetr import RFDETRBase

    project = Path(project)
    run_dir = project / "runs" / run_name
    ckpt = next((run_dir / "checkpoint").glob("*.pth"), None)
    if ckpt is None:
        raise SystemExit(f"no checkpoint in {run_dir}/checkpoint/")

    split = json.loads((project / "split.json").read_text())
    llm = coco.load(project / "annotations" / "llm.coco.json")
    val_imgs = [i for i in llm["images"] if i["id"] in set(split["val"])]
    cat_names = {c["id"]: c["name"] for c in llm["categories"]}
    # pycocotools wants contiguous 1..N category ids; remap
    remap = {cid: n + 1 for n, cid in enumerate(sorted(cat_names))}

    gt = {"images": [{**i} for i in val_imgs],
          "annotations": [{**a, "category_id": remap[a["category_id"]]}
                          for a in llm["annotations"] if a["image_id"] in set(split["val"])],
          "categories": [{"id": remap[cid], "name": name} for cid, name in cat_names.items()]}
    gt_path = run_dir / "val_gt.coco.json"
    coco.save(gt_path, gt)

    model = RFDETRBase()
    model.load_from_checkpoint(str(ckpt))
    preds = []
    name_to_cid = {name: cid for cid, name in cat_names.items()}
    for img in val_imgs:
        dets = model.predict(str(project / "images" / img["file_name"]))
        for box, score, cls in zip(dets.boxes, dets.scores, dets.class_names):
            cid = name_to_cid.get(cls)
            if cid is None:
                continue
            preds.append({"image_id": img["id"], "category_id": remap[cid],
                          "bbox": [float(v) for v in box], "score": float(score)})

    if not preds:
        return {"map50": 0.0, "map50_95": 0.0, "per_class": {}}

    coco_gt = COCO(str(gt_path))
    coco_dt = coco_gt.loadRes(preds)
    e = COCOeval(coco_gt, coco_dt, "bbox")
    e.evaluate(); e.accumulate(); e.summarize()
    per_class = {}
    for cid, name in cat_names.items():
        e_c = COCOeval(coco_gt, coco_dt, "bbox")
        e_c.params.catIds = [remap[cid]]
        e_c.evaluate(); e_c.accumulate(); e_c.summarize()
        per_class[name] = round(e_c.stats[1], 4)  # AP@50

    result = {"map50": round(e.stats[1], 4), "map50_95": round(e.stats[0], 4), "per_class": per_class}
    (run_dir / "metrics.json").write_text(json.dumps(result, indent=2))
    return result


def benchmark(project, model, limit=None):
    """Run a VLM on gold images and score its boxes against gold annotations.
    A match = IoU > 0.5 with the same class name."""
    from .label import query_vlm, to_px
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
        raw = query_vlm(path, query=query, model=model)
        boxes = to_px(raw, img["width"], img["height"])
        fake_gold = [{"bbox": b["bbox"], "category_id": b["label"]} for b in boxes]
        fake_true = [{"bbox": a["bbox"], "category_id": gold_cat[a["category_id"]]}
                     for a in gold_anns.get(img["id"], [])]
        pairs = _match(fake_gold, fake_true)
        # keep only same-class pairs as true matches
        same = sum(1 for gi, ti in pairs
                   if fake_gold[gi]["category_id"] == fake_true[ti]["category_id"])
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

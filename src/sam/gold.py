"""Gold subset management: promote llm labels, diff llm vs gold -> correction rate.

Gold is a parallel dataset: `annotations/gold.coco.json`. The `llm` file is
never mutated. The correction rate measures how much human fixing was needed,
i.e. how good the VLM was on this data.
"""
from pathlib import Path

from . import coco

IOU_MATCH = 0.5


def gold_path(project):
    return Path(project) / "annotations" / "gold.coco.json"


def exists(project):
    return gold_path(project).exists()


def promote(project):
    """`accept-all`: copy llm -> gold unedited. No-op if gold already exists."""
    src = Path(project) / "annotations" / "llm.coco.json"
    dst = gold_path(project)
    if not src.exists():
        raise SystemExit("no llm annotations found; run `sam label` first")
    if dst.exists():
        raise SystemExit("gold.coco.json already exists; refusing to overwrite")
    coco.save(dst, coco.load(src))
    return str(dst)


def iou(a, b):
    ax0, ay0, aw, ah = a["bbox"]
    bx0, by0, bw, bh = b["bbox"]
    ix = max(0.0, min(ax0 + aw, bx0 + bw) - max(ax0, bx0))
    iy = max(0.0, min(ay0 + ah, by0 + bh) - max(ay0, by0))
    inter = ix * iy
    union = aw * ah + bw * bh - inter
    return inter / union if union > 0 else 0.0


def _match(llm_boxes, gold_boxes):
    """Greedy IoU matching within one image. Returns list of (llm_idx, gold_idx)."""
    pairs = sorted(
        ((iou(l, g), li, gi) for li, l in enumerate(llm_boxes) for gi, g in enumerate(gold_boxes)),
        reverse=True,
    )
    used_l, used_g, matches = set(), set(), []
    for score, li, gi in pairs:
        if score < IOU_MATCH or li in used_l or gi in used_g:
            continue
        used_l.add(li)
        used_g.add(gi)
        matches.append((li, gi))
    return matches


def _by_image(dataset):
    anns = {}
    for a in dataset["annotations"]:
        anns.setdefault(a["image_id"], []).append(a)
    return anns


def cat_name(dataset, cid):
    return next((c["name"] for c in dataset["categories"] if c["id"] == cid), None)


def diff_stats(project):
    """Compare llm vs gold per image. Returns correction-rate summary dict."""
    project = Path(project)
    llm = coco.load(project / "annotations" / "llm.coco.json")
    gold = coco.load(gold_path(project))

    llm_anns, gold_anns = _by_image(llm), _by_image(gold)
    all_ids = {img["id"] for img in llm["images"]} | {img["id"] for img in gold["images"]}

    kept = relabeled = removed = added = 0
    for img_id in all_ids:
        lb, gb = llm_anns.get(img_id, []), gold_anns.get(img_id, [])
        for li, gi in _match(lb, gb):
            if cat_name(llm, lb[li]["category_id"]) == cat_name(gold, gb[gi]["category_id"]):
                kept += 1
            else:
                relabeled += 1  # right box, wrong class
        removed += len(lb) - len([1 for li, _ in _match(lb, gb)])
        added += len(gb) - len([1 for _, gi in _match(lb, gb)])

    llm_total = sum(len(v) for v in llm_anns.values())
    touched = relabeled + removed + added
    return {
        "images": len(all_ids),
        "llm_boxes": llm_total,
        "gold_boxes": sum(len(v) for v in gold_anns.values()),
        "kept": kept,
        "relabeled": relabeled,
        "removed": removed,
        "added": added,
        # ponytail: single aggregate number; per-class breakdown if the leaderboard needs it
        "correction_rate": round(touched / llm_total, 4) if llm_total else None,
    }

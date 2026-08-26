"""Validation split: 10% of the dataset (seeded, deterministic); all gold
images are forced into validation and never trained on."""
import random
from pathlib import Path

from . import coco

SEED = 42


def make_split(project, val_frac=0.1):
    """Build the train/val split manifest. Returns {train: [ids], val: [ids]}.

    Rule: val = ceil(val_frac * total), gold image ids forced into val,
    remainder drawn deterministically from llm-only images.
    """
    project = Path(project)
    llm = coco.load(project / "annotations" / "llm.coco.json")
    all_ids = [img["id"] for img in llm["images"]]

    gold_ids = set()
    gold_path = project / "annotations" / "gold.coco.json"
    if gold_path.exists():
        gold = coco.load(gold_path)
        gold_ids = {img["id"] for img in gold["images"]}
        # gold ids that exist in llm images (gold reviews the same frames)
        gold_ids &= set(all_ids)

    target = max(1, round(val_frac * len(all_ids))) if all_ids else 0
    rest = [i for i in all_ids if i not in gold_ids]
    rng = random.Random(SEED)
    rng.shuffle(rest)
    need = max(0, target - len(gold_ids))
    val = sorted(gold_ids | set(rest[:need]))
    train = sorted(set(all_ids) - set(val))

    split = {"train": train, "val": val,
             "gold_in_val": sorted(gold_ids), "seed": SEED}
    out = project / "split.json"
    out.write_text(__import__("json").dumps(split, indent=2))
    return split

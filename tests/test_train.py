"""Offline checks for dataset materialization (no torch/rfdetr needed).

Key invariant under test: gold annotations win over llm for images they cover.
"""
import copy
import json
import shutil
import tempfile
from pathlib import Path

from sam import coco
from sam.train import materialize_dataset


def _mkproj():
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    return d


def _proj_with_split(with_gold=True):
    d = _mkproj()
    # 3 images: 1 and 2 have llm boxes, 3 has none. Gold covers image 1 only.
    llm = coco.new_coco()
    for i in (1, 2, 3):
        llm["images"].append({"id": i, "file_name": f"img{i}.png", "width": 100, "height": 100})
        if i in (1, 2):
            llm["annotations"].append({"id": i, "image_id": i, "category_id": 1,
                                       "bbox": [0, 0, 10, 10], "area": 100, "iscrowd": 0})
    llm["categories"] = [{"id": 1, "name": "cat"}]
    coco.save(d / "annotations" / "llm.coco.json", llm)

    if with_gold:
        gold = copy.deepcopy(llm)
        gold["images"] = [llm["images"][0]]
        gold["annotations"] = [{"id": 1, "image_id": 1, "category_id": 1,
                                "bbox": [50, 50, 25, 25], "area": 625, "iscrowd": 0}]  # corrected box
        coco.save(d / "annotations" / "gold.coco.json", gold)

    for i in (1, 2, 3):
        (d / "images" / f"img{i}.png").write_bytes(b"fake")  # not a real image; copy2 doesn't care
    # gold image (1) in val, rest in train
    split = {"train": [2, 3], "val": [1], "gold_in_val": [1]}
    return d, split


def test_materialize_gold_wins_and_layout():
    d, split = _proj_with_split(with_gold=True)
    dest = d / "runs" / "r1" / "dataset"
    counts = materialize_dataset(d, split, dest)
    assert counts == {"train_images": 2, "val_images": 1}

    tr = coco.load(dest / "train" / "_annotations.coco.json")
    va = coco.load(dest / "valid" / "_annotations.coco.json")
    assert [i["id"] for i in tr["images"]] == [2, 3]
    assert [i["id"] for i in va["images"]] == [1]
    # image 2's llm ann survives, renumbered; image 3 has none
    assert [(a["id"], a["image_id"]) for a in tr["annotations"]] == [(1, 2)]
    # gold box (not the llm box) on the val image
    assert va["annotations"][0]["bbox"] == [50, 50, 25, 25]
    # categories carried through
    assert tr["categories"] == [{"id": 1, "name": "cat"}]
    # images copied
    assert (dest / "train" / "img2.png").exists()
    assert (dest / "valid" / "img1.png").exists()
    assert not (dest / "train" / "img1.png").exists()
    shutil.rmtree(d)


def test_materialize_without_gold_uses_llm():
    d, split = _proj_with_split(with_gold=False)
    dest = d / "runs" / "r2" / "dataset"
    materialize_dataset(d, split, dest)
    va = coco.load(dest / "valid" / "_annotations.coco.json")
    assert va["annotations"][0]["bbox"] == [0, 0, 10, 10]  # llm box, no gold override
    shutil.rmtree(d)


if __name__ == "__main__":
    test_materialize_gold_wins_and_layout()
    test_materialize_without_gold_uses_llm()
    print("all train materialize tests passed")

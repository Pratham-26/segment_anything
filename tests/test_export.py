"""Offline checks for dataset export (zip contents, gold-wins merge)."""
import json
import copy
import shutil
import tempfile
import zipfile
from pathlib import Path

from sam import coco
from sam.export import export_project


def _mkproj(with_split=False):
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    llm = coco.new_coco()
    for i in (1, 2, 3):
        llm["images"].append({"id": i, "file_name": f"img{i}.png", "width": 100, "height": 100})
        if i in (1, 2):
            llm["annotations"].append({"id": i, "image_id": i, "category_id": 1,
                                       "bbox": [0, 0, 10, 10], "area": 100, "iscrowd": 0})
    llm["categories"] = [{"id": 1, "name": "cat"}]
    coco.save(d / "annotations" / "llm.coco.json", llm)
    gold = copy.deepcopy(llm)
    gold["images"] = [llm["images"][0]]
    gold["annotations"] = [{"id": 1, "image_id": 1, "category_id": 1,
                            "bbox": [50, 50, 25, 25], "area": 625, "iscrowd": 0}]
    coco.save(d / "annotations" / "gold.coco.json", gold)
    for i in (1, 2, 3):
        (d / "images" / f"img{i}.png").write_bytes(f"bytes{i}".encode())
    if with_split:
        (d / "split.json").write_text(json.dumps({"train": [2, 3], "val": [1], "gold_in_val": [1]}))
    return d


def _load_zip(path):
    with zipfile.ZipFile(path) as z:
        return z, {n: z.read(n) for n in z.namelist()}


def test_export_flat_gold_wins():
    d = _mkproj()
    out = export_project(d)
    assert out.exists() and out.parent.name == "exports"
    z, files = _load_zip(out)
    # flat: annotations json + all 3 images at zip root
    assert "_annotations.coco.json" in files
    assert {n for n in files if n.endswith(".png")} == {"img1.png", "img2.png", "img3.png"}
    c = json.loads(files["_annotations.coco.json"])
    by_img = {a["image_id"]: a["bbox"] for a in c["annotations"]}
    assert by_img[1] == [50, 50, 25, 25]  # gold wins on covered image
    assert by_img[2] == [0, 0, 10, 10]    # llm elsewhere
    assert c["categories"] == [{"id": 1, "name": "cat"}]
    assert files["img1.png"] == b"bytes1"
    shutil.rmtree(d)


def test_export_split_layout():
    d = _mkproj(with_split=True)
    out = export_project(d, with_split=True)
    z, files = _load_zip(out)
    assert "train/_annotations.coco.json" in files and "valid/_annotations.coco.json" in files
    assert "train/img2.png" in files and "valid/img1.png" in files
    va = json.loads(files["valid/_annotations.coco.json"])
    assert va["annotations"][0]["bbox"] == [50, 50, 25, 25]  # gold in val
    shutil.rmtree(d)


def test_export_without_gold_uses_llm():
    d = _mkproj()
    (d / "annotations" / "gold.coco.json").unlink()
    out = export_project(d)
    _, files = _load_zip(out)
    c = json.loads(files["_annotations.coco.json"])
    assert {a["image_id"]: a["bbox"] for a in c["annotations"]} == {1: [0, 0, 10, 10], 2: [0, 0, 10, 10]}
    shutil.rmtree(d)


if __name__ == "__main__":
    test_export_flat_gold_wins()
    test_export_split_layout()
    test_export_without_gold_uses_llm()
    print("all export tests passed")

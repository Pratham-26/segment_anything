"""Offline checks for ingest, split (no gold leakage), and gold diff."""
import json
import shutil
import tempfile
from pathlib import Path

from PIL import Image

from sam import coco
from sam.gold import diff_stats, iou, promote
from sam.ingest import ingest
from sam.split import make_split


def _mkproj():
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    return d


def _mkimg(path, size=(100, 100), color=(120, 120, 120)):
    Image.new("RGB", size, color).save(path)


def test_ingest_dedups_and_numbers():
    d = _mkproj()
    src = d / "src"; src.mkdir()
    _mkimg(src / "a.png", color=(10, 10, 10))
    _mkimg(src / "b.png", color=(20, 20, 20))
    _mkimg(src / "a_dup.png", color=(10, 10, 10))          # same bytes as a.png
    _mkimg(src / "a2.png", color=(30, 30, 30))  # same NAME pattern, diff bytes

    s1 = ingest([src / "a.png", src / "b.png"], d)
    assert s1["copied"] == 2 and s1["skipped"] == 0, s1
    s2 = ingest([src / "a_dup.png"], d)                     # dedup by hash
    assert s2["copied"] == 0 and s2["skipped"] == 1
    s3 = ingest([src / "a.png"], d)                         # same name+content -> skip
    assert s3["copied"] == 0
    shutil.rmtree(d)


def test_ingest_pdf_split():
    import pypdfium2 as pdfium
    d = _mkproj()
    pdf_path = d / "two_pages.pdf"
    pdf = pdfium.PdfDocument.new()
    pdf.new_page(200, 100)
    pdf.new_page(180, 100)  # different size -> different rendered bytes
    pdf.save(str(pdf_path)); pdf.close()
    s = ingest([pdf_path], d)
    assert s["pdf_pages"] == 2, s
    pages = sorted(p.name for p in (d / "images").iterdir())
    assert pages == ["two_pages_p001.png", "two_pages_p002.png"], pages
    shutil.rmtree(d)


def _coco_for(d, images, anns_per_img):
    c = coco.new_coco()
    aid = 1
    for i, img in enumerate(images, start=1):
        c["images"].append({"id": i, "file_name": img, "width": 100, "height": 100})
        for k in range(anns_per_img(i)):
            c["annotations"].append({
                "id": aid, "image_id": i, "category_id": 1,
                "bbox": [10 * k, 10, 20, 20], "area": 400, "iscrowd": 0})
            aid += 1
    c["categories"] = [{"id": 1, "name": "cat"}]
    coco.save(d / "annotations" / "llm.coco.json", c)
    return c


def test_split_gold_never_leaks_into_train():
    d = _mkproj()
    (d / "annotations").mkdir()
    n = 50
    _coco_for(d, [f"img{i:03}.png" for i in range(n)], lambda i: 1 + i % 3)

    # gold covers images 1..5
    gold = coco.load(d / "annotations" / "llm.coco.json")
    gold["images"] = gold["images"][:5]
    gold["annotations"] = [a for a in gold["annotations"] if a["image_id"] <= 5]
    coco.save(d / "annotations" / "gold.coco.json", gold)

    split = make_split(d, val_frac=0.1)
    assert len(split["val"]) == 5, split            # 10% of 50 = 5, gold fills it exactly
    assert set(split["gold_in_val"]) == {1, 2, 3, 4, 5}
    assert set(split["train"]) & set(split["val"]) == set()
    assert set(split["gold_in_val"]) & set(split["train"]) == set()
    # deterministic: same seed, same result
    split2 = make_split(d, val_frac=0.1)
    assert split == split2

    # no gold: val still 5, drawn from llm
    (d / "annotations" / "gold.coco.json").unlink()
    split3 = make_split(d, val_frac=0.1)
    assert len(split3["val"]) == 5 and not split3["gold_in_val"]
    shutil.rmtree(d)


def test_gold_promote_and_diff():
    d = _mkproj()
    (d / "annotations").mkdir()
    _coco_for(d, ["x.png", "y.png"], lambda i: 2 if i == 1 else 1)
    promote(d)
    assert (d / "annotations" / "gold.coco.json").exists()
    try:
        promote(d); assert False, "second promote must refuse"
    except SystemExit:
        pass

    # stats on identical sets: zero corrections
    s = diff_stats(d)
    assert s["correction_rate"] == 0 and s["added"] == 0 and s["removed"] == 0, s

    # edit gold: delete one box on image 1, add one on image 2, relabel one
    gold = coco.load(d / "annotations" / "gold.coco.json")
    gold["annotations"] = [a for a in gold["annotations"] if a["id"] != 1]  # remove
    gold["annotations"].append({"id": 99, "image_id": 2, "category_id": 1,
                                "bbox": [60, 60, 30, 30], "area": 900, "iscrowd": 0})
    gold["annotations"][-2]["category_id"] = 2  # relabel the remaining image-1 box
    gold["categories"].append({"id": 2, "name": "dog"})
    coco.save(d / "annotations" / "gold.coco.json", gold)

    s = diff_stats(d)
    assert s["kept"] == 1 and s["removed"] == 1 and s["added"] == 1 and s["relabeled"] == 1, s
    assert s["correction_rate"] == round(3 / 3, 4), s  # 3 touched / 3 llm boxes
    shutil.rmtree(d)


def test_iou():
    a = {"bbox": [0, 0, 10, 10]}
    assert iou(a, {"bbox": [0, 0, 10, 10]}) == 1.0
    assert iou(a, {"bbox": [5, 0, 10, 10]}) == 50 / 150
    assert iou(a, {"bbox": [20, 20, 5, 5]}) == 0.0


if __name__ == "__main__":
    for name, fn in sorted(list(globals().items())):
        if name.startswith("test_"):
            fn()
    print("all ingest/split/gold tests passed")

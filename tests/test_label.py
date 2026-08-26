"""Offline checks for the vision-LLM labeling logic (no network)."""
import json
from pathlib import Path

from sam import coco
from sam.label import build_prompt, extract_json, to_px


def test_extract_json_handles_fences_and_prose():
    raw = 'Sure! ```json\n{"annotations": [{"label": "cat", "bbox_2d": [1, 2, 3, 4]}]}\n``` hope that helps'
    assert extract_json(raw) == {"annotations": [{"label": "cat", "bbox_2d": [1, 2, 3, 4]}]}
    assert extract_json("no json here") is None
    assert extract_json('{"annotations": broken') is None


def test_to_px_scales_clamps_and_drops_junk():
    anns = [
        {"label": "cat", "bbox_2d": [0, 0, 500, 500]},          # normal -> 100x100 px box
        {"label": "edge", "bbox_2d": [900, 900, 1200, 1200]},   # clamped to image bounds
        {"label": "", "bbox_2d": [0, 0, 10, 10]},               # no label -> dropped
        {"label": "tiny", "bbox_2d": [5, 5, 5.0001, 6]},        # sub-pixel -> dropped
        {"label": "bad", "bbox_2d": ["a", "b", "c", "d"]},      # malformed -> dropped
        {"label": "reversed", "bbox_2d": [600, 700, 200, 100]}, # swapped corners -> still valid
    ]
    out = to_px(anns, width=200, height=200)
    assert len(out) == 3
    cat = next(a for a in out if a["label"] == "cat")
    assert cat["bbox"] == [0.0, 0.0, 100.0, 100.0]
    edge = next(a for a in out if a["label"] == "edge")
    assert edge["bbox"] == [180.0, 180.0, 20.0, 20.0]


def test_coco_roundtrip_and_category_ids():
    c = coco.new_coco()
    assert coco.category_id(c, "dog") == 1
    assert coco.category_id(c, "cat") == 2
    assert coco.category_id(c, "dog") == 1  # stable on re-request
    import tempfile
    p = Path(tempfile.gettempdir()) / "test_llm.coco.json"
    coco.save(p, c)
    assert coco.load(p) == c


if __name__ == "__main__":
    test_extract_json_handles_fences_and_prose()
    test_to_px_scales_clamps_and_drops_junk()
    test_coco_roundtrip_and_category_ids()
    print("all label tests passed")

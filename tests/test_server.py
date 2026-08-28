"""Offline checks for the FastAPI server endpoints (no VLM, no rfdetr)."""
import shutil
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from sam import coco
from sam.config import load_config, save_config
from sam.server import create_app


def _mkproj(with_data=True):
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    if with_data:
        (d / "images" / "img1.png").write_bytes(b"fake")
        c = coco.new_coco()
        c["images"].append({"id": 1, "file_name": "img1.png", "width": 100, "height": 100})
        c["annotations"].append({"id": 1, "image_id": 1, "category_id": 1,
                                 "bbox": [0, 0, 10, 10], "area": 100, "iscrowd": 0})
        c["categories"] = [{"id": 1, "name": "cat"}]
        coco.save(d / "annotations" / "llm.coco.json", c)
    return d


def test_config_defaults_and_roundtrip():
    d = _mkproj(with_data=False)
    cfg = load_config(d)
    assert cfg["variant"] == "rf-detr-base" and cfg["val_frac"] == 0.1  # defaults
    save_config(d, {"query": "boxes of cats", "vlm": "gpt-4o"})
    cfg = load_config(d)
    assert cfg["query"] == "boxes of cats" and cfg["vlm"] == "gpt-4o"
    assert cfg["variant"] == "rf-detr-base"  # unset keys keep defaults
    shutil.rmtree(d)


def test_status_annotations_and_gold_save():
    d = _mkproj()
    client = TestClient(create_app(str(d)))

    r = client.get("/api/status")
    assert r.status_code == 200
    s = r.json()
    assert s["images"] == 1 and s["has_llm"] is True and s["has_gold"] is False

    r = client.get("/api/annotations/llm")
    assert r.status_code == 200 and len(r.json()["annotations"]) == 1
    r = client.get("/api/annotations/gold")
    assert r.status_code == 404

    # save a gold annotation via the API, then read it back
    gold = {"images": [], "annotations": [{"id": 1, "image_id": 1, "category_id": 1,
                                           "bbox": [5, 5, 5, 5], "area": 25, "iscrowd": 0}],
            "categories": [{"id": 1, "name": "cat"}]}
    r = client.put("/api/annotations/gold", json=gold)
    assert r.status_code == 200
    assert client.get("/api/status").json()["has_gold"] is True
    assert client.get("/api/annotations/gold").json()["annotations"][0]["bbox"] == [5, 5, 5, 5]
    shutil.rmtree(d)


def test_metrics_latest_run_and_explicit():
    d = _mkproj()
    runs = d / "runs"
    for run, map50 in (("run_20250101", 0.5), ("run_20250202", 0.9)):
        (runs / run).mkdir(parents=True)
        coco.save(runs / run / "metrics.json", {"map50": map50})
    (runs / "run_empty").mkdir()  # no metrics.json -> must be ignored

    client = TestClient(create_app(str(d)))
    r = client.get("/api/metrics")  # no run -> latest by name
    assert r.status_code == 200
    assert r.json()["run"] == "run_20250202" and r.json()["map50"] == 0.9

    r = client.get("/api/metrics/run_20250101")
    assert r.json()["run"] == "run_20250101" and r.json()["map50"] == 0.5

    r = client.get("/api/metrics/does_not_exist")
    assert r.status_code == 404

    shutil.rmtree(d)
    # no runs at all -> 404, not a crash
    d = _mkproj()
    assert TestClient(create_app(str(d))).get("/api/metrics").status_code == 404
    shutil.rmtree(d)


if __name__ == "__main__":
    test_config_defaults_and_roundtrip()
    test_status_annotations_and_gold_save()
    test_metrics_latest_run_and_explicit()
    print("all server/config tests passed")

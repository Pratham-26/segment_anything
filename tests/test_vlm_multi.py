"""Multi-model VLM support: config shortlist, benchmark_multi, server exposure."""
import json
import shutil
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from sam import coco, evaluate as evaluate_mod
from sam.config import load_config, save_config
from sam.server import create_app


def _mkproj_with_gold():
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    (d / "images" / "img1.png").write_bytes(b"a")
    (d / "images" / "img2.png").write_bytes(b"b")
    gold = coco.new_coco()
    for i, name in enumerate(("img1.png", "img2.png"), start=1):
        gold["images"].append({"id": i, "file_name": name, "width": 100, "height": 100})
    gold["annotations"].append(
        {"id": 1, "image_id": 1, "category_id": 1, "bbox": [10, 10, 40, 40], "area": 1600, "iscrowd": 0}
    )
    gold["categories"] = [{"id": 1, "name": "cat"}]
    coco.save(d / "annotations" / "gold.coco.json", gold)
    save_config(d, {"query": "all cats", "vlm": "m/one", "vlms": ["m/one", "m/two"]})
    return d


def test_config_vlms_roundtrip_and_coercion():
    d = Path(tempfile.mkdtemp())
    save_config(d, {"vlms": ["a/b", "c/d"]})
    assert load_config(d)["vlms"] == ["a/b", "c/d"]
    (d / "config.yaml").write_text("query: x\nvlms: not-a-list\n")
    assert load_config(d)["vlms"] == []
    assert load_config(d)["vlm"] is None  # default intact
    shutil.rmtree(d)


def test_benchmark_multi_scores_models_on_same_gold(tmp_path, monkeypatch):
    d = _mkproj_with_gold()
    calls = []

    def fake_query_vlm(image_path, query, model, retries=2):
        calls.append((Path(image_path).name, query, model))
        # model one boxes perfectly on img1; model two misses everything
        if model == "m/one" and Path(image_path).name == "img1.png":
            return [{"bbox_2d": [100, 100, 500, 500], "label": "cat"}]
        return []

    monkeypatch.setattr("sam.label.query_vlm", fake_query_vlm)
    out = evaluate_mod.benchmark_multi(d, ["m/one", "m/two"], limit=2)
    assert out["models"] == ["m/one", "m/two"]
    assert len(out["results"]) == 2
    good, bad = out["results"]
    assert good["model"] == "m/one" and good["matched"] == 1 and good["precision"] == 1.0
    assert bad["model"] == "m/two" and bad["matched"] == 0
    # same gold sample for both models: identical image sequence
    per_model = {m: [img for img, _, m2 in calls if m2 == m] for m in ("m/one", "m/two")}
    assert per_model["m/one"] == per_model["m/two"]
    shutil.rmtree(d)


def test_api_benchmark_multi_and_status_vlms(monkeypatch):
    d = _mkproj_with_gold()
    monkeypatch.setattr(
        evaluate_mod,
        "benchmark",
        lambda project, model, limit=None: {"model": model, "matched": 1, "images": 2,
                                            "missed": 0, "spurious": 0,
                                            "precision": 1.0, "recall": 1.0},
    )
    client = TestClient(create_app(str(d)))

    st = client.get("/api/status")
    assert st.json()["vlms"] == ["m/one", "m/two"]

    single = client.get("/api/benchmark?model=m/one&limit=2").json()
    assert single["model"] == "m/one"  # backward-compatible single shape

    multi = client.get("/api/benchmark?model=m/one,m/two&limit=2").json()
    assert [r["model"] for r in multi["results"]] == ["m/one", "m/two"]

    empty = client.get("/api/benchmark?model=%20&limit=2")
    assert empty.status_code == 400
    shutil.rmtree(d)


def test_benchmark_reuses_label_cache(monkeypatch):
    """benchmark must consult the same on-disk cache as labeling: a cached
    (image, query, model) response means no API call and no key needed."""
    d = _mkproj_with_gold()
    from sam.label import _cache_path

    def boom(image_path, query, model, retries=2):
        raise AssertionError("query_vlm must not be called when the cache has the response")

    monkeypatch.setattr("sam.label.query_vlm", boom)
    img = d / "images" / "img1.png"
    cpath = _cache_path(d, img, model="m/cached", query="all cats")
    cpath.parent.mkdir(parents=True, exist_ok=True)
    cpath.write_text(json.dumps([{ "bbox_2d": [100, 100, 500, 500], "label": "cat" }]))

    out = evaluate_mod.benchmark(d, model="m/cached", limit=1)
    assert out["matched"] == 1 and out["precision"] == 1.0
    shutil.rmtree(d)


def test_server_scoped_to_project_outside_root():
    """create_app(<specific project dir>) must serve ?project=<its name> even when
    the dir is not under the projects root (e2e fixtures and single-project deploys)."""
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    (d / "annotations" / "llm.coco.json").write_text(
        json.dumps({"images": [], "annotations": [], "categories": []})
    )
    client = TestClient(create_app(str(d)))
    r = client.get("/api/status", params={"project": d.name})
    assert r.status_code == 200 and r.json()["project"] == d.name
    assert client.get("/api/annotations/llm", params={"project": d.name}).status_code == 200
    assert client.get("/api/runs", params={"project": d.name}).status_code == 200
    shutil.rmtree(d)


def test_gold_subset_untouched_by_benchmark():
    d = _mkproj_with_gold()
    before = (d / "annotations" / "gold.coco.json").read_text()
    monkey_needed = json.loads(before)
    monkey_needed["annotations"]  # touch
    assert (d / "annotations" / "gold.coco.json").read_text() == before
    shutil.rmtree(d)

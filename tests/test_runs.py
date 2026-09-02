"""Multi-model detector runs: variant registry, per-run metadata, /api/runs."""
import json
import shutil
import tempfile
from pathlib import Path

from fastapi.testclient import TestClient

from sam import train as train_mod
from sam.server import create_app


def _mkproj():
    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    return d


class _FakeModel:
    """Stands in for an rfdetr class; records from_checkpoint calls."""

    name = "fake"


def test_load_model_for_run_uses_recorded_variant(tmp_path, monkeypatch):
    (tmp_path / "run.json").write_text(json.dumps({"run": "r1", "variant": "rf-detr-large"}))

    def mk(name):
        c = type(name, (), {})
        c.from_checkpoint = classmethod(lambda cls, ckpt, _n=name: {"model": _n, "ckpt": ckpt})
        return c

    classes = {"rf-detr-base": mk("base"), "rf-detr-large": mk("large"), "rf-detr-nano": mk("nano")}
    monkeypatch.setattr(train_mod, "available_variants", lambda: classes)

    got = train_mod.load_model_for_run(tmp_path, "best.pth")
    assert got == {"model": "large", "ckpt": "best.pth"}


def test_load_model_for_run_legacy_fallback_chain(tmp_path, monkeypatch):
    # no run.json: smallest variant first
    tried = []
    classes = {}
    for name in ("rf-detr-base", "rf-detr-large", "rf-detr-nano"):
        short = name.split("-")[-1]

        def mk_from(n):
            def from_checkpoint(cls, ckpt):
                tried.append(n)
                if n == "base":  # only base loads in this scenario
                    return {"model": n}
                raise RuntimeError(f"{n} cannot load this checkpoint")

            return from_checkpoint

        classes[name] = type(short, (), {})
        classes[name].from_checkpoint = classmethod(mk_from(short))
    monkeypatch.setattr(train_mod, "available_variants", lambda: classes)

    got = train_mod.load_model_for_run(tmp_path, "best.pth")
    assert got == {"model": "base"}
    assert tried == ["nano", "base"]  # nano first (smallest), base second


def test_model_cls_rejects_unknown_variant():
    import pytest

    with pytest.raises(ValueError, match="unknown variant"):
        train_mod.model_cls("rf-detr-turbo")


def test_train_writes_run_metadata(tmp_path, monkeypatch):
    """train() must persist variant/epochs to run.json (meta written before the
    heavy import; we monkeypatch the model away)."""
    d = _mkproj()
    (d / "annotations" / "llm.coco.json").write_text(
        json.dumps({"images": [], "annotations": [], "categories": [{"id": 1, "name": "x"}]})
    )
    (d / "split.json").write_text(json.dumps({"train": [], "val": []}))

    class FakeInstance:
        def train(self, **kwargs):
            (Path(kwargs["output_dir"]) / "checkpoint.pth").write_bytes(b"x")

    monkeypatch.setattr(
        train_mod, "model_cls", lambda v: (lambda **kw: FakeInstance())
    )
    out = train_mod.train(d, variant="rf-detr-nano", epochs=2, run_name="r_meta")
    assert out["variant"] == "rf-detr-nano"
    meta = json.loads((d / "runs" / "r_meta" / "run.json").read_text())
    assert meta["variant"] == "rf-detr-nano"
    assert meta["epochs"] == 2
    assert meta["status"] == "done"
    shutil.rmtree(d)


def test_api_runs_lists_variant_and_metrics():
    d = _mkproj()
    run = d / "runs" / "run_a"
    run.mkdir(parents=True)
    (run / "run.json").write_text(
        json.dumps({"run": "run_a", "variant": "rf-detr-nano", "epochs": 2, "status": "done"})
    )
    (run / "metrics.json").write_text(
        json.dumps({"map50": "0.71", "map50_95": "0.52", "per_class": {"x": "0.68"}})
    )
    client = TestClient(create_app(str(d)))
    res = client.get("/api/runs")
    assert res.status_code == 200
    runs = res.json()
    assert len(runs) == 1
    r = runs[0]
    assert r["run"] == "run_a"
    assert r["variant"] == "rf-detr-nano"
    assert r["epochs"] == 2
    assert r["metrics"] == {"map50": "0.71", "map50_95": "0.52"}
    # per-run metrics endpoint still resolves
    m = client.get("/api/metrics/run_a")
    assert m.status_code == 200
    assert m.json()["run"] == "run_a"
    shutil.rmtree(d)


def test_api_train_rejects_unknown_variant():
    d = _mkproj()
    client = TestClient(create_app(str(d)))
    res = client.post("/api/train?variant=rf-detr-turbo&epochs=2")
    assert res.status_code == 400
    assert "unknown variant" in res.json()["error"]
    res = client.post("/api/train?variant=rf-detr-nano&epochs=0")
    assert res.status_code == 400
    shutil.rmtree(d)


def test_api_metrics_rejects_bad_run_name():
    d = _mkproj()
    client = TestClient(create_app(str(d)))
    res = client.get("/api/metrics/bad$name")
    assert res.status_code == 400
    shutil.rmtree(d)

"""Export a project's dataset as a COCO zip for use outside the pipeline.

Flat export: images/ + _annotations.coco.json at the zip root, gold-wins merge
applied. With --split: rfdetr's train/valid layout using the project split.
"""
import json
import tempfile
import zipfile
from pathlib import Path

from . import coco, split as split_mod
from .train import materialize_dataset


def export_project(project, out=None, with_split=False):
    """Write a zip; returns its path."""
    project = Path(project)
    suffix = "_split" if with_split else ""
    out = Path(out) if out else project / "exports" / f"{project.name}{suffix}.zip"
    out.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory() as td:
        if with_split:
            sp = project / "split.json"
            split = json.loads(sp.read_text()) if sp.exists() else split_mod.make_split(project)
            materialize_dataset(project, split, td)
            root = Path(td)
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                for p in sorted(root.rglob("*")):
                    if p.is_file():
                        z.write(p, p.relative_to(root).as_posix())
        else:
            ids = [i["id"] for i in coco.load(project / "annotations" / "llm.coco.json")["images"]]
            materialize_dataset(project, {"train": ids, "val": [], "gold_in_val": []}, Path(td) / "flat")
            root = Path(td) / "flat" / "train"
            with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
                for p in sorted(root.iterdir()):
                    z.write(p, p.name)  # images + _annotations.coco.json, all flat

    return out

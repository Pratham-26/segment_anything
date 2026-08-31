"""FastAPI server: serves the review UI (web/) and a thin REST layer over the
core library. All logic lives in src/sam/*; this file only wires endpoints."""
import re
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import coco, gold, ingest, label, split as split_mod, train as train_mod, evaluate as evaluate_mod
from . import export as export_mod
from .config import load_config, save_config

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"
WEB_DIST = WEB_DIR / "dist"  # built by `npm run build` inside web/ (Vite + React + shadcn/ui)


def create_app(project: str = ".", projects_root: str | None = None) -> FastAPI:
    app = FastAPI(title="segment_anything")
    P = Path(project).resolve()
    root = Path(projects_root) if projects_root else (
        Path("projects") if Path("projects").is_dir() else P.parent)
    ROOT = root.resolve()

    def proj(name: str | None = None) -> Path:
        """Active project dir: ?project=<name> (a dir under the root), else the default."""
        if name and Path(name).name == name and not name.startswith("."):
            p = ROOT / name
            if p.is_dir():
                return p
        return P

    def summary(p: Path) -> dict:
        """One-line pipeline state of a project, for the projects list."""
        cfg = load_config(p)
        images_dir = p / "images"
        n_images = (len([q for q in images_dir.iterdir()
                         if q.suffix.lower() in ingest.IMAGE_EXTS])
                    if images_dir.is_dir() else 0)
        n_boxes, classes = 0, []
        if (p / "annotations" / "llm.coco.json").exists():
            try:
                data = coco.load(p / "annotations" / "llm.coco.json")
                n_boxes = len(data["annotations"])
                classes = [c["name"] for c in data["categories"]]
            except Exception:
                pass
        runs_dir = p / "runs"
        runs = [d for d in runs_dir.iterdir() if d.is_dir()] if runs_dir.is_dir() else []
        has_metrics = any((d / "metrics.json").exists() for d in runs)
        has_llm = (p / "annotations" / "llm.coco.json").exists()
        has_gold = gold.exists(p)
        stage = ("empty" if n_images == 0 else
                 "ready to label" if not has_llm else
                 "needs review" if not has_gold else
                 "ready to train" if not runs else
                 "trained")
        return {"name": p.name, "stage": stage, "images": n_images,
                "boxes": n_boxes, "classes": classes, "gold": has_gold,
                "runs": len(runs), "metrics": has_metrics,
                "query": cfg["query"], "vlm": cfg["vlm"]}

    @app.get("/api/projects")
    def list_projects():
        out = [summary(d) for d in sorted(ROOT.iterdir())
               if d.is_dir() and not d.name.startswith(".")]
        if P.parent == ROOT and P.name not in {p["name"] for p in out}:
            out.insert(0, summary(P))
        return out

    @app.post("/api/projects")
    def create_project(payload: dict):
        name = (payload.get("name") or "").strip().replace(" ", "-")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", name):
            return JSONResponse({"error": "use letters, digits, - or _"}, status_code=400)
        p = ROOT / name
        (p / "images").mkdir(parents=True, exist_ok=True)
        (p / "annotations").mkdir(exist_ok=True)
        if not (p / "config.yaml").exists():
            save_config(p, {})
        return summary(p)

    @app.get("/api/status")
    def status(project: str | None = None):
        p = proj(project)
        s = summary(p)
        return {
            "project": p.name,
            "images": s["images"],
            "query": s["query"],
            "vlm": s["vlm"],
            "has_llm": (p / "annotations" / "llm.coco.json").exists(),
            "has_gold": s["gold"],
            "stage": s["stage"],
        }

    @app.get("/api/annotations/{subset}")
    def annotations(subset: str, project: str | None = None):
        p = proj(project)
        path = p / "annotations" / f"{subset}.coco.json"
        if not path.exists():
            return JSONResponse(None, status_code=404)
        return coco.load(path)

    @app.put("/api/annotations/gold")
    async def save_gold(payload: dict, project: str | None = None):
        p = proj(project)
        out = p / "annotations" / "gold.coco.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        coco.save(out, payload)
        return {"ok": True, "path": str(out)}

    @app.get("/api/image/{name}")
    def image(name: str, project: str | None = None):
        return FileResponse(proj(project) / "images" / name)

    @app.post("/api/ingest")
    async def ingest_files(files: list[UploadFile] = File(...), project: str | None = None):
        p = proj(project)
        tmp = p / ".upload_tmp"
        tmp.mkdir(exist_ok=True)
        paths = []
        for f in files:
            dest = tmp / f.filename
            dest.write_bytes(await f.read())
            paths.append(dest)
        result = ingest.ingest(paths, p)
        for path in paths:
            path.unlink()
        return result

    @app.post("/api/label")
    def label_run(query: str | None = None, model: str | None = None, limit: int | None = None,
                  project: str | None = None):
        return label.label_project(proj(project), query=query, model=model, limit=limit)

    @app.post("/api/train")
    def train_run(variant: str = "rf-detr-base", epochs: int = 100, project: str | None = None):
        return train_mod.train(proj(project), variant=variant, epochs=epochs)

    @app.get("/api/corrections")
    def corrections(project: str | None = None):
        p = proj(project)
        if not gold.exists(p):
            return JSONResponse({"error": "no gold yet"}, status_code=404)
        return gold.diff_stats(p)

    @app.post("/api/split")
    def do_split(val_frac: float = 0.1, project: str | None = None):
        return split_mod.make_split(proj(project), val_frac=val_frac)

    @app.get("/api/metrics")
    @app.get("/api/metrics/{run}")
    def metrics(run: str | None = None, project: str | None = None):
        p = proj(project)
        if run:
            m = p / "runs" / run / "metrics.json"
        else:
            latest = max((d for d in (p / "runs").glob("*") if (d / "metrics.json").exists()),
                         key=lambda d: d.name, default=None)
            m = latest / "metrics.json" if latest else None
        if not m or not m.exists():
            return JSONResponse({"error": "no metrics"}, status_code=404)
        return {**coco.load(m), "run": m.parent.name}

    @app.get("/api/benchmark")
    def benchmark(model: str, limit: int | None = None, project: str | None = None):
        return evaluate_mod.benchmark(proj(project), model=model, limit=limit)

    @app.get("/api/export")
    def export_zip(split: bool = False, project: str | None = None):
        path = export_mod.export_project(proj(project), with_split=split)
        return FileResponse(path, filename=path.name, media_type="application/zip")

    if (WEB_DIST / "index.html").is_file():
        app.mount("/", StaticFiles(directory=WEB_DIST, html=True), name="web")
    else:
        @app.get("/")
        def ui_not_built():
            return JSONResponse(
                {"error": "review UI not built", "fix": "cd web && npm install && npm run build"},
                status_code=503,
            )
    return app

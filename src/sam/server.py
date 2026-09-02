"""FastAPI server: serves the review UI (web/) and a thin REST layer over the
core library. All logic lives in src/sam/*; this file only wires endpoints."""
import json
import logging
import re
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import coco, gold, ingest, label, split as split_mod, train as train_mod, evaluate as evaluate_mod
from . import export as export_mod
from .config import load_config, save_config

logger = logging.getLogger("sam.server")

NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]*")
SUBSETS = {"llm", "gold"}

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"
WEB_DIST = WEB_DIR / "dist"  # built by `npm run build` inside web/ (Vite + React + shadcn/ui)


def create_app(project: str = ".", projects_root: str | None = None) -> FastAPI:
    app = FastAPI(title="segment_anything")
    P = Path(project).resolve()
    root = Path(projects_root) if projects_root else (
        Path("projects") if Path("projects").is_dir() else P.parent)
    ROOT = root.resolve()

    def proj(name: str | None = None, *, strict: bool = False):
        """Active project dir. Lenient mode (default): an absent name resolves to
        the default project. Strict mode: a name that is malformed or unknown
        yields (None, 4xx JSON) so the API never silently serves another project
        nor leaks a traceback."""
        if name:
            if not NAME_RE.fullmatch(name):
                return None, JSONResponse({"error": "bad project name"}, status_code=400)
            if name == P.name:  # the server's own project, wherever it lives
                return P, None
            p = ROOT / name
            if not p.is_dir():
                return None, JSONResponse({"error": f"unknown project '{name}'"}, status_code=404)
            return p, None
        if strict:
            return None, JSONResponse({"error": "project required"}, status_code=400)
        return P, None

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
                "query": cfg["query"], "vlm": cfg["vlm"], "vlms": cfg.get("vlms") or []}

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
        p, err = proj(project)
        if err:
            return err
        s = summary(p)
        return {
            "project": p.name,
            "images": s["images"],
            "query": s["query"],
            "vlm": s["vlm"],
            "has_llm": (p / "annotations" / "llm.coco.json").exists(),
            "has_gold": s["gold"],
            "stage": s["stage"],
            "vlms": s["vlms"],
        }

    @app.get("/api/annotations/{subset}")
    def annotations(subset: str, project: str | None = None):
        if subset not in SUBSETS:
            return JSONResponse({"error": f"subset must be one of {sorted(SUBSETS)}"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        path = p / "annotations" / f"{subset}.coco.json"
        if not path.exists():
            return JSONResponse(None, status_code=404)
        return coco.load(path)

    @app.put("/api/annotations/gold")
    async def save_gold(payload: dict, project: str | None = None):
        if not (isinstance(payload.get("images"), list)
                and isinstance(payload.get("annotations"), list)
                and isinstance(payload.get("categories"), list)):
            return JSONResponse(
                {"error": "gold payload must be a COCO dict with images/annotations/categories lists"},
                status_code=400,
            )
        p, err = proj(project)
        if err:
            return err
        out = p / "annotations" / "gold.coco.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        coco.save(out, payload)
        return {"ok": True, "path": str(out)}

    @app.get("/api/image/{name}")
    def image(name: str, project: str | None = None):
        if not NAME_RE.match(name) or "/" in name or "\\" in name or ".." in name:
            return JSONResponse({"error": "bad image name"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        path = p / "images" / name
        if not path.is_file():
            return JSONResponse({"error": "no such image"}, status_code=404)
        return FileResponse(path)

    @app.post("/api/ingest")
    async def ingest_files(files: list[UploadFile] = File(...), project: str | None = None):
        p, err = proj(project)
        if err:
            return err
        tmp = p / ".upload_tmp"
        tmp.mkdir(exist_ok=True)
        paths = []
        for f in files:
            if not f.filename or not NAME_RE.match(Path(f.filename).name):
                return JSONResponse({"error": f"bad filename: {f.filename!r}"}, status_code=400)
            dest = tmp / Path(f.filename).name
            dest.write_bytes(await f.read())
            paths.append(dest)
        try:
            result = ingest.ingest(paths, p)
        except Exception as e:
            logger.exception("ingest failed")
            return JSONResponse({"error": f"ingest failed: {e}"}, status_code=500)
        finally:
            for path in paths:
                path.unlink(missing_ok=True)
        return result

    @app.post("/api/label")
    def label_run(query: str | None = None, model: str | None = None,
                  limit: int | None = None, project: str | None = None):
        if limit is not None and not (1 <= limit <= 10000):
            return JSONResponse({"error": "limit must be between 1 and 10000"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        try:
            return label.label_project(p, query=query, model=model, limit=limit)
        except SystemExit as e:
            return JSONResponse({"error": str(e)}, status_code=400)

    @app.post("/api/train")
    def train_run(variant: str = "rf-detr-base", epochs: int = 100, project: str | None = None):
        if variant not in train_mod.VARIANT_NAMES:
            return JSONResponse(
                {"error": f"unknown variant '{variant}'; expected one of {list(train_mod.VARIANT_NAMES)}"},
                status_code=400,
            )
        if epochs < 1:
            return JSONResponse({"error": "epochs must be >= 1"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        return train_mod.train(p, variant=variant, epochs=epochs)

    @app.get("/api/corrections")
    def corrections(project: str | None = None):
        p, err = proj(project)
        if err:
            return err
        if not gold.exists(p):
            return JSONResponse({"error": "no gold yet"}, status_code=404)
        return gold.diff_stats(p)

    @app.post("/api/split")
    def do_split(val_frac: float = 0.1, project: str | None = None):
        if not (0.0 < val_frac < 1.0):
            return JSONResponse({"error": "val_frac must be between 0 and 1"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        return split_mod.make_split(p, val_frac=val_frac)

    @app.get("/api/runs")
    def list_runs(project: str | None = None):
        """All detector runs of a project: name, variant, epochs, status, metrics."""
        p, err = proj(project)
        if err:
            return err
        runs_dir = p / "runs"
        out = []
        for d in sorted((x for x in runs_dir.iterdir() if x.is_dir()), reverse=True) if runs_dir.is_dir() else []:
            meta = {}
            if (d / "run.json").exists():
                try:
                    meta = json.loads((d / "run.json").read_text())
                except Exception:
                    meta = {}
            metrics = None
            if (d / "metrics.json").exists():
                try:
                    mm = coco.load(d / "metrics.json")
                    metrics = {"map50": mm.get("map50"), "map50_95": mm.get("map50_95")}
                except Exception:
                    metrics = None
            out.append({
                "run": d.name,
                "variant": meta.get("variant"),
                "epochs": meta.get("epochs"),
                "status": meta.get("status", "done" if metrics else "unknown"),
                "metrics": metrics,
            })
        return out

    @app.get("/api/metrics")
    @app.get("/api/metrics/{run}")
    def metrics(run: str | None = None, project: str | None = None):
        p, err = proj(project)
        if err:
            return err
        if run:
            if not NAME_RE.fullmatch(run):
                return JSONResponse({"error": "bad run name"}, status_code=400)
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
        """Score VLM(s) against gold. `model` is one LiteLLM id or a comma-separated
        list; multiple ids return {"results": [...]} on the same gold sample."""
        models = [m.strip() for m in model.split(",") if m.strip()]
        if not models:
            return JSONResponse({"error": "no model given"}, status_code=400)
        if limit is not None and not (1 <= limit <= 10000):
            return JSONResponse({"error": "limit must be between 1 and 10000"}, status_code=400)
        p, err = proj(project)
        if err:
            return err
        if len(models) > 1:
            return evaluate_mod.benchmark_multi(p, models, limit=limit)
        return evaluate_mod.benchmark(p, model=models[0], limit=limit)

    @app.get("/api/export")
    def export_zip(split: bool = False, project: str | None = None):
        p, err = proj(project)
        if err:
            return err
        path = export_mod.export_project(p, with_split=split)
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

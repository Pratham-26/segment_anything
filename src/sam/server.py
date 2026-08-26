"""FastAPI server: serves the review UI (web/) and a thin REST layer over the
core library. All logic lives in src/sam/*; this file only wires endpoints."""
from pathlib import Path

from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import coco, gold, ingest, label, split as split_mod, train as train_mod, evaluate as evaluate_mod
from .config import load_config

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"


def create_app(project: str = ".") -> FastAPI:
    app = FastAPI(title="segment_anything")
    P = Path(project).resolve()

    @app.get("/api/status")
    def status():
        cfg = load_config(P)
        n_images = len([p for p in (P / "images").iterdir()]) if (P / "images").exists() else 0
        return {
            "project": P.name,
            "images": n_images,
            "query": cfg["query"],
            "vlm": cfg["vlm"],
            "has_llm": (P / "annotations" / "llm.coco.json").exists(),
            "has_gold": gold.exists(P),
        }

    @app.get("/api/annotations/{subset}")
    def annotations(subset: str):
        path = P / "annotations" / f"{subset}.coco.json"
        if not path.exists():
            return JSONResponse(None, status_code=404)
        return coco.load(path)

    @app.put("/api/annotations/gold")
    async def save_gold(payload: dict):
        out = P / "annotations" / "gold.coco.json"
        out.parent.mkdir(parents=True, exist_ok=True)
        coco.save(out, payload)
        return {"ok": True, "path": str(out)}

    @app.get("/api/image/{name}")
    def image(name: str):
        return FileResponse(P / "images" / name)

    @app.post("/api/ingest")
    async def ingest_files(files: list[UploadFile] = File(...)):
        tmp = P / ".upload_tmp"
        tmp.mkdir(exist_ok=True)
        paths = []
        for f in files:
            dest = tmp / f.filename
            dest.write_bytes(await f.read())
            paths.append(dest)
        result = ingest.ingest(paths, P)
        for p in paths:
            p.unlink()
        return result

    @app.post("/api/label")
    def label_run(query: str | None = None, model: str | None = None, limit: int | None = None):
        return label.label_project(P, query=query, model=model, limit=limit)

    @app.post("/api/train")
    def train_run(variant: str = "rf-detr-base", epochs: int = 100):
        return train_mod.train(P, variant=variant, epochs=epochs)

    @app.get("/api/corrections")
    def corrections():
        if not gold.exists(P):
            return JSONResponse({"error": "no gold yet"}, status_code=404)
        return gold.diff_stats(P)

    @app.post("/api/split")
    def do_split(val_frac: float = 0.1):
        return split_mod.make_split(P, val_frac=val_frac)

    @app.get("/api/metrics/{run}")
    def metrics(run: str):
        m = P / "runs" / run / "metrics.json"
        if not m.exists():
            return JSONResponse({"error": "no metrics"}, status_code=404)
        return coco.load(m)

    @app.get("/api/benchmark")
    def benchmark(model: str, limit: int | None = None):
        return evaluate_mod.benchmark(P, model=model, limit=limit)

    app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
    return app


app = create_app  # uvicorn sam.server:app --factory

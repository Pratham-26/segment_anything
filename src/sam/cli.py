"""`sam` CLI — thin argparse shell over the core library."""
import argparse
import json
import sys
from pathlib import Path

from .config import load_config


def main(argv=None):
    p = argparse.ArgumentParser(prog="sam", description="query-driven auto-labeling + RF-DETR training",
                                allow_abbrev=False)
    p.add_argument("--project", default=".", help="project directory (default: cwd)")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("ingest", help="ingest images/PDFs (files or dirs)")
    s.add_argument("paths", nargs="+")

    s = sub.add_parser("label", help="run vision-LLM labeling")
    s.add_argument("--query", help="what to box (default: config.yaml)")
    s.add_argument("--vlm", help="LiteLLM model id (default: config.yaml)")
    s.add_argument("--limit", type=int)

    s = sub.add_parser("review", help="open the annotation web UI", allow_abbrev=False)
    s.add_argument("--project", dest="review_project", default=None,
                   help="project directory (overrides the global --project)")
    s.add_argument("--port", type=int, default=8000)
    s.add_argument("--host", default="127.0.0.1")
    s.add_argument("--projects-root", default=None,
                   help="dir whose subfolders are listed as projects (default: ./projects if present)")

    s = sub.add_parser("accept-all", help="promote llm -> gold unedited")

    s = sub.add_parser("split", help="build train/val split (val=10%%, gold forced in)")
    s.add_argument("--val-frac", type=float, default=0.1)

    s = sub.add_parser("train", help="train RF-DETR")
    s.add_argument("--variant", default="rf-detr-base")
    s.add_argument("--epochs", type=int, default=100)

    s = sub.add_parser("eval", help="evaluate a run on validation")
    s.add_argument("run")

    s = sub.add_parser("benchmark", help="score a VLM against gold")
    s.add_argument("--vlm", required=True)
    s.add_argument("--limit", type=int)

    s = sub.add_parser("corrections", help="llm-vs-gold correction stats")

    s = sub.add_parser("export", help="export dataset as COCO zip (gold wins over llm)")
    s.add_argument("--split", action="store_true", help="rfdetr train/valid layout using the project split")
    s.add_argument("--out", default=None, help="zip path (default <project>/exports/<name>.zip)")

    s = sub.add_parser("status", help="project summary")

    a = p.parse_args(argv)
    P = Path(a.review_project) if getattr(a, "review_project", None) else Path(a.project)

    if a.cmd == "ingest":
        from . import ingest
        out = ingest.ingest(a.paths, P)
    elif a.cmd == "label":
        from . import label
        out = label.label_project(P, query=a.query, model=a.vlm, limit=a.limit)
    elif a.cmd == "review":
        import uvicorn
        from .server import create_app
        app = create_app(P, projects_root=a.projects_root)
        print(f"review UI: http://{a.host}:{a.port}  (project: {P.resolve()})")
        uvicorn.run(app, host=a.host, port=a.port)
        return 0
    elif a.cmd == "accept-all":
        from . import gold
        out = {"gold": gold.promote(P)}
    elif a.cmd == "split":
        from . import split as split_mod
        out = split_mod.make_split(P, val_frac=a.val_frac)
    elif a.cmd == "train":
        from . import train as train_mod
        out = train_mod.train(P, variant=a.variant, epochs=a.epochs)
    elif a.cmd == "eval":
        from . import evaluate as evaluate_mod
        out = evaluate_mod.eval_run(P, a.run)
    elif a.cmd == "benchmark":
        from . import evaluate as evaluate_mod
        out = evaluate_mod.benchmark(P, model=a.vlm, limit=a.limit)
    elif a.cmd == "corrections":
        from . import gold
        out = gold.diff_stats(P)
    elif a.cmd == "export":
        from . import export as export_mod
        out = {"zip": str(export_mod.export_project(P, out=a.out, with_split=a.split))}
    elif a.cmd == "status":
        from . import gold
        cfg = load_config(P)
        imgs = P / "images"
        out = {
            "project": str(P.resolve()),
            "images": len(list(imgs.iterdir())) if imgs.exists() else 0,
            "query": cfg["query"], "vlm": cfg["vlm"],
            "llm": (P / "annotations" / "llm.coco.json").exists(),
            "gold": gold.exists(P),
            "split": (P / "split.json").exists(),
            "runs": sorted(r.name for r in (P / "runs").iterdir()) if (P / "runs").exists() else [],
        }
    else:
        p.error(f"unknown command {a.cmd}")

    print(json.dumps(out, indent=2, default=str))
    return 0


if __name__ == "__main__":
    sys.exit(main())

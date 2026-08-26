"""Vision-LLM labeling via LiteLLM: images + query -> annotations/llm.coco.json.

Model choice is entirely user config (any LiteLLM-supported VLM).
Responses are cached on disk; re-runs with the same image+query+model are free.
"""
import base64
import hashlib
import json
import re
import time
from pathlib import Path

from PIL import Image

from . import coco
from .config import load_config, save_config

# bump when the prompt changes so caches invalidate
PROMPT_VERSION = 1

SYSTEM = (
    "You annotate images with bounding boxes for object detection training. "
    "Respond with JSON only, no markdown fences, no commentary."
)


def build_prompt(query):
    return (
        f"Detect every instance of the following in the image: {query}\n"
        'Respond with JSON exactly like: {"annotations": [{"label": "<class name>", '
        '"bbox_2d": [xmin, ymin, xmax, ymax]}]}\n'
        "Coordinates are integers in [0, 1000], normalized to the image size. "
        "Return an empty list if nothing is found."
    )


def extract_json(text):
    """Pull the first JSON object out of a model response; None if unparseable."""
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(0))
    except json.JSONDecodeError:
        return None


def to_px(annotations, width, height):
    """Validate/scale normalized [0,1000] boxes to COCO pixel xywh. Drops junk."""
    out = []
    for ann in annotations or []:
        try:
            x0, y0, x1, y1 = (float(v) for v in ann["bbox_2d"])
            label = str(ann["label"]).strip()
        except (KeyError, TypeError, ValueError):
            continue
        if not label:
            continue
        x0, x1 = sorted((max(0.0, min(x0, 1000)), max(0.0, min(x1, 1000))))
        y0, y1 = sorted((max(0.0, min(y0, 1000)), max(0.0, min(y1, 1000))))
        bw, bh = (x1 - x0) / 1000 * width, (y1 - y0) / 1000 * height
        # ponytail: flat 1px floor; per-class min sizes if tiny-object recall matters
        if bw < 1 or bh < 1:
            continue
        out.append({
            "label": label,
            "bbox": [x0 / 1000 * width, y0 / 1000 * height, bw, bh],
        })
    return out


def _encode_image(image_path):
    data = Path(image_path).read_bytes()
    b64 = base64.b64encode(data).decode()
    mime = "image/jpeg" if Path(image_path).suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return f"data:{mime};base64,{b64}"


def _cache_path(project, image_path, model, query):
    task = hashlib.sha1(f"{PROMPT_VERSION}|{model}|{query}".encode()).hexdigest()
    img = hashlib.sha1(Path(image_path).read_bytes()).hexdigest()
    return Path(project) / "cache" / f"{task}_{img}.json"


def query_vlm(image_path, query, model, retries=2):
    """Call the VLM once for one image. Returns raw parsed annotation list ([] on failure).

    Retries up to `retries` times with exponential backoff (1s, 2s), but only on
    rate-limit errors and unparseable/empty payloads — anything else raises
    immediately (a bad key won't get better by waiting).
    """
    import litellm
    from litellm import completion

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": [
            {"type": "text", "text": build_prompt(query)},
            {"type": "image_url", "image_url": {"url": _encode_image(image_path)}},
        ]},
    ]
    for attempt in range(retries + 1):
        try:
            resp = completion(model=model, messages=messages)
        except litellm.RateLimitError:
            if attempt == retries:
                raise
            time.sleep(2 ** attempt)
            continue
        anns = extract_json(resp.choices[0].message.content)
        if isinstance(anns, dict) and isinstance(anns.get("annotations"), list):
            return anns["annotations"]
        if attempt < retries:  # malformed payload -> try again
            continue
    return []


def label_project(project, query=None, model=None, limit=None):
    """Label every ingested image. Writes annotations/llm.coco.json. Returns summary dict."""
    project = Path(project)
    cfg = load_config(project)
    query = query or cfg["query"]
    model = model or cfg["vlm"]
    if not query or not model:
        raise SystemExit("query and vlm must be set (argument or config.yaml)")

    cfg.update({"query": query, "vlm": model})
    save_config(project, cfg)

    exts = {".jpg", ".jpeg", ".png"}
    images = sorted(p for p in (project / "images").iterdir() if p.suffix.lower() in exts)
    if limit:
        images = images[:limit]

    out = coco.new_coco()
    ann_id = 1
    labeled = 0
    failures = []
    for img_id, path in enumerate(images, start=1):
        cpath = _cache_path(project, path, model, query)
        if cpath.exists():
            raw = json.loads(cpath.read_text())
        else:
            try:
                raw = query_vlm(path, query, model)
            except Exception as e:  # log and move on; fix later via gold/review
                print(f"[warn] {path.name}: {e}")
                failures.append({"image": path.name, "error": str(e)})
                continue
            cpath.parent.mkdir(parents=True, exist_ok=True)
            cpath.write_text(json.dumps(raw))
        with Image.open(path) as im:
            width, height = im.size
        out["images"].append({"id": img_id, "file_name": path.name, "width": width, "height": height})
        for ann in to_px(raw, width, height):
            out["annotations"].append({
                "id": ann_id,
                "image_id": img_id,
                "category_id": coco.category_id(out, ann["label"]),
                "bbox": [round(v, 2) for v in ann["bbox"]],
                "area": round(ann["bbox"][2] * ann["bbox"][3], 2),
                "iscrowd": 0,
            })
            ann_id += 1
        labeled += 1

    outpath = project / "annotations" / "llm.coco.json"
    outpath.parent.mkdir(parents=True, exist_ok=True)
    coco.save(outpath, out)

    failpath = project / "annotations" / "label_failures.json"
    if failures:
        failpath.write_text(json.dumps(failures, indent=2))
    elif failpath.exists():
        failpath.unlink()  # previous run had failures, this one didn't

    return {
        "images": len(images),
        "labeled": labeled,
        "failed_images": [f["image"] for f in failures],
        "boxes": len(out["annotations"]),
        "classes": sorted(c["name"] for c in out["categories"]),
        "output": str(outpath),
    }

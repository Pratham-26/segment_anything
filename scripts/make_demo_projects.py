"""Generate demo projects under projects/ so the UI has something real to show.

Three projects at different pipeline stages:
  demo-forms     scanned-style forms, labeled by a free OpenRouter VLM -> "needs review"
  demo-scenes    geometric scenes, labeled by a different free VLM -> "needs review"
  demo-invoices  labeled + partially gold-corrected + split + placeholder run -> "trained"

Labels come from REAL VLM calls through the normal pipeline (sam.label -> LiteLLM),
cached on disk like any other run. Images are synthetic (PIL) and carry the ground
truth used to inject a few plausible human corrections into demo-invoices' gold.

Usage:
  OPENROUTER_API_KEY=sk-or-... uv run python scripts/make_demo_projects.py
  (--skip-vlm makes images + config only; rerun later without the flag to label)
"""
import argparse
import copy
import math
import os
import random
import shutil
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sam import coco  # noqa: E402
from sam import label as label_mod, split as split_mod  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]

PEN = (28, 32, 92)      # signature ink
TEXT = (45, 45, 52)
GRAY = (120, 120, 125)
PAPER = (244, 241, 231)
RED = (196, 60, 50)

_fonts = {}


def font(size, bold=False):
    key = (size, bold)
    if key not in _fonts:
        for name in (("arialbd.ttf", "arial.ttf") if bold else ("arial.ttf",)):
            try:
                _fonts[key] = ImageFont.truetype(name, size)
                break
            except OSError:
                continue
        else:
            _fonts[key] = ImageFont.load_default()
    return _fonts[key]


def squiggle(draw, x, y, w, h, rng):
    """A handwritten-signature-looking line. Returns its bbox."""
    pts = []
    phase = rng.uniform(0, 6)
    n = 70
    for i in range(n + 1):
        t = i / n
        px = x + t * w
        py = y + h / 2 + math.sin(t * rng.uniform(7, 11) + phase) * h * 0.32 + rng.uniform(-2.5, 2.5)
        pts.append((px, py))
    draw.line(pts, fill=PEN, width=4, joint="curve")
    return [x, y + 4, w, h - 8]


def paper(w, h):
    img = Image.new("RGB", (w, h), PAPER)
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w - 1, h - 1], outline=(208, 203, 188), width=3)
    return img, d


def typed(d, xy, text, size=30, fill=TEXT):
    d.text(xy, text, fill=fill, font=font(size))
    box = d.textbbox(xy, text, font=font(size))
    return [box[0] - 4, box[1] - 4, box[2] - box[0] + 8, box[3] - box[1] + 8]


def make_form(path, seed):
    """Scanned-style form. Always a signature + a date; returns ground-truth boxes."""
    rng = random.Random(seed)
    img, d = paper(1400, 1000)
    d.text((90, 70), rng.choice(["SERVICE REQUEST FORM", "MAINTENANCE ORDER",
                                 "CONSENT FORM", "REGISTRATION FORM"]),
           fill=TEXT, font=font(44, bold=True))
    d.line([90, 140, 1310, 140], fill=GRAY, width=2)

    gt = {}
    y = 200
    extras = rng.sample(["ACCOUNT NO.", "PHONE", "ADDRESS", "EMAIL", "ORDER REF"], k=rng.randint(2, 3))
    for field in extras:
        d.text((110, y), field, fill=GRAY, font=font(26))
        d.line([420, y + 34, 1290, y + 34], fill=GRAY, width=2)
        if rng.random() < 0.5:  # some fields are filled in by hand
            squiggle(d, 430, y + 2, rng.randint(200, 380), 32, rng)
        y += 90

    # date
    d.text((110, y), "DATE", fill=GRAY, font=font(26))
    date = f"{rng.randint(1, 28):02d}/{rng.randint(1, 12):02d}/202{rng.randint(3, 5)}"
    gt["date"] = typed(d, (420, y), date)
    y += 110

    # signature over its rule line
    d.text((110, y), "SIGNATURE", fill=GRAY, font=font(26))
    d.line([420, y + 78, 1290, y + 78], fill=GRAY, width=2)
    gt["signature"] = squiggle(d, 440, y + 8, rng.randint(300, 480), 62, rng)
    y += 130

    if rng.random() < 0.6:  # approval stamp
        d.rectangle([950, y + 30, 1240, y + 120], outline=RED, width=5)
        gt["stamp"] = [950, y + 30, 290, 90]
        d.text((985, y + 52), "APPROVED", fill=RED, font=font(40, bold=True))

    img.save(path)
    return gt


def make_invoice(path, seed):
    """Invoice-style form: invoice number, total due, due date (typed text)."""
    rng = random.Random(seed)
    img, d = paper(1400, 1000)
    d.text((90, 70), "INVOICE", fill=TEXT, font=font(46, bold=True))
    d.line([90, 145, 1310, 145], fill=GRAY, width=2)
    d.text((90, 170), rng.choice(["Acme Facilities Ltd", "Northgate Supplies Co", "Beacon Services GmbH"]),
           fill=GRAY, font=font(28))

    gt = {}
    gt["invoice_number"] = typed(d, (880, 90), f"INV-202{rng.randint(3, 5)}-{rng.randint(100, 999):04d}")
    y = 300
    for line in ("DESCRIPTION", "QTY", "AMOUNT"):
        d.text((110 if line == "DESCRIPTION" else (900 if line == "QTY" else 1100), y),
               line, fill=GRAY, font=font(24))
    d.line([110, y + 40, 1290, y + 40], fill=GRAY, width=2)
    for i in range(rng.randint(2, 4)):
        y += 70
        squiggle(d, 120, y - 6, rng.randint(320, 520), 26, rng)
        typed(d, (1100, y), f"${rng.randint(40, 900)}.00", size=26)
    y += 110
    d.text((820, y), "TOTAL DUE", fill=GRAY, font=font(28))
    gt["total_due"] = typed(d, (1080, y - 4), f"${rng.randint(1000, 9800)}.{rng.randint(10, 99)}", size=34)
    y += 100
    d.text((820, y), "DUE DATE", fill=GRAY, font=font(28))
    gt["due_date"] = typed(d, (1080, y - 4),
                           f"{rng.randint(1, 28):02d}/{rng.randint(1, 12):02d}/202{rng.randint(4, 6)}", size=30)
    img.save(path)
    return gt


def make_scene(path, seed):
    """Dark scene with red circles + blue rectangles (green triangles as distractors)."""
    rng = random.Random(seed)
    img = Image.new("RGB", (1280, 960), (17, 26, 22))
    d = ImageDraw.Draw(img)
    for _ in range(6):  # faint background texture
        x, y, r = rng.randint(0, 1280), rng.randint(0, 960), rng.randint(80, 220)
        d.ellipse([x - r, y - r, x + r, y + r], fill=(21, 31, 26))
    placed = []

    def place(w, h):
        for _ in range(300):
            x, y = rng.randint(30, 1280 - w - 30), rng.randint(30, 960 - h - 30)
            if all(x + w + 36 < p[0] or p[0] + p[2] + 36 < x or
                   y + h + 36 < p[1] or p[1] + p[3] + 36 < y for p in placed):
                placed.append((x, y, w, h))
                return x, y
        return None

    gt = {"red_circle": [], "blue_rectangle": []}
    for _ in range(rng.randint(1, 3)):
        r = rng.randint(55, 105)
        pos = place(2 * r, 2 * r)
        if pos:
            d.ellipse([pos[0], pos[1], pos[0] + 2 * r, pos[1] + 2 * r], fill=(219, 81, 66))
            gt["red_circle"].append([pos[0], pos[1], 2 * r, 2 * r])
    for _ in range(rng.randint(1, 2)):
        w, h = rng.randint(150, 270), rng.randint(90, 160)
        pos = place(w, h)
        if pos:
            d.rectangle([pos[0], pos[1], pos[0] + w, pos[1] + h], fill=(83, 130, 219))
            gt["blue_rectangle"].append([pos[0], pos[1], w, h])
    for _ in range(rng.randint(1, 3)):  # distractors, not in the query
        s = rng.randint(70, 130)
        pos = place(s, s)
        if pos:
            d.polygon([(pos[0] + s / 2, pos[1]), (pos[0], pos[1] + s), (pos[0] + s, pos[1] + s)],
                      fill=(66, 160, 96))
    img.save(path)
    return gt


def build_images(project, count, maker, seed0):
    (project / "images").mkdir(parents=True, exist_ok=True)
    gt = {}
    for i in range(count):
        name = f"{maker.__name__.replace('make_', '')}_{i + 1:02d}.png"
        gt[i + 1] = maker(project / "images" / name, seed0 + i)
    return gt


def llm_to_gold(project, gt, rng_seed=7):
    """Perturb llm -> gold the way a human reviewer would: tighten boxes, drop a
    spurious one, add a missed one. Gold covers a SUBSET of frames (the rest stay
    llm-only), so the split invariant (gold -> val) leaves a real train set."""
    rng = random.Random(rng_seed)
    llm = coco.load(project / "annotations" / "llm.coco.json")
    gold = copy.deepcopy(llm)
    cats = {c["name"]: c["id"] for c in gold["categories"]}

    def cat_for(key):
        # gt keys like "total_due" -> match the VLM's category names loosely
        words = key.replace("_", " ").split()
        for name, cid in cats.items():
            if all(w in name for w in words) or all(w in key for w in name.split()):
                return cid
        return None

    corrected = gold["images"][:max(1, len(gold["images"]) // 3)]  # reviewer did ~1/3
    keep_ids = {im["id"] for im in corrected}
    anns, aid = [], max((a["id"] for a in gold["annotations"]), default=0)
    for a in gold["annotations"]:
        if a["image_id"] not in keep_ids:
            continue
        if rng.random() < 0.3:
            continue  # reviewer deleted a spurious box
        dx, dy = rng.randint(-9, 9), rng.randint(-7, 7)
        a["bbox"] = [round(a["bbox"][0] + dx, 2), round(a["bbox"][1] + dy, 2),
                     max(10, round(a["bbox"][2] - dx - rng.randint(0, 8), 2)),
                     max(10, round(a["bbox"][3] - dy - rng.randint(0, 6), 2))]
        anns.append(a)
    # reviewer added one box the VLM missed (from generation ground truth)
    for im in corrected:
        for key, box in gt.get(im["id"], {}).items():
            cid = cat_for(key)
            if cid is None:
                continue
            x, y, w, h = box
            aid += 1
            anns.append({"id": aid, "image_id": im["id"], "category_id": cid,
                         "bbox": [x, y, w, h], "area": w * h, "iscrowd": 0})
            break  # one added box per reviewed frame is enough
    gold["images"], gold["annotations"] = corrected, anns
    coco.save(project / "annotations" / "gold.coco.json", gold)
    return len(corrected)


_original_vlm = label_mod.query_vlm


def patient_vlm(image_path, query, model, retries=8):
    """label.py retries twice, fast — enough for paid tiers. Shared :free pools
    need minutes of backoff, so wrap it here. The disk cache makes partial
    progress free on rerun."""
    import time
    delay = 5
    for attempt in range(retries):
        try:
            return _original_vlm(image_path, query, model, retries=1)
        except Exception as e:
            rate_limited = "429" in str(e) or "Rate" in type(e).__name__ or "ResourceExha" in str(e)
            if attempt == retries - 1 or not rate_limited:
                raise
            print(f"    rate-limited on {model}, waiting {delay}s…")
            time.sleep(delay)
            delay = min(delay * 2, 60)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=str(ROOT / "projects"))
    ap.add_argument("--api-key", default=os.environ.get("OPENROUTER_API_KEY"))
    ap.add_argument("--vlm-forms", default="openrouter/minimax/minimax-m3:free")
    ap.add_argument("--vlm-scenes", default="openrouter/dots-studio/dots-3-note-preview:free")
    ap.add_argument("--vlm-invoices", default="openrouter/openrouter/free")
    ap.add_argument("--images", type=int, default=8)
    ap.add_argument("--skip-vlm", action="store_true", help="images + config only, no VLM calls")
    a = ap.parse_args()

    if a.api_key:
        os.environ["OPENROUTER_API_KEY"] = a.api_key
    root = Path(a.root)
    label_mod.query_vlm = patient_vlm  # patient backoff for the free pools

    plans = [
        ("demo-forms", make_form, "every signature and every date", a.vlm_forms),
        ("demo-scenes", make_scene, "every red circle and every blue rectangle", a.vlm_scenes),
        ("demo-invoices", make_invoice, "every invoice number and every total due amount", a.vlm_invoices),
    ]
    for i, (name, maker, query, vlm) in enumerate(plans):
        project = root / name
        if project.exists():
            shutil.rmtree(project)
        gt = build_images(project, a.images, maker, seed0=100 * (i + 1))
        print(f"[{name}] {a.images} images written")
        if a.skip_vlm:
            continue
        print(f"[{name}] labeling with {vlm}: {query!r}")
        result = label_mod.label_project(project, query=query, model=vlm)
        print(f"[{name}] {result['labeled']}/{result['images']} labeled, "
              f"{result['boxes']} boxes, classes={result['classes']}"
              + (f", FAILED: {result['failed_images']}" if result["failed_images"] else ""))
        if name == "demo-invoices":
            n = llm_to_gold(project, gt)
            split_mod.make_split(project)
            runs = project / "runs" / "2025-08-29_demo"
            runs.mkdir(parents=True, exist_ok=True)
            per_class = {c: round(0.3 + 0.1 * j, 4) for j, c in enumerate(sorted(result["classes"]))}
            (runs / "metrics.json").write_text(json_dumps({
                "map50": 0.4612, "map50_95": 0.2937, "per_class": per_class,
                "_note": "placeholder numbers so the Results view has something to render",
            }))
            split = (project / "split.json").read_text()
            print(f"[{name}] gold on {n} frames, split + placeholder metrics written")

    print("done.")


def json_dumps(obj):
    import json
    return json.dumps(obj, indent=2)


if __name__ == "__main__":
    main()

"""Browser tests for the review UI (web/, Vite + React + shadcn/ui) via Playwright.

Runs against the BUILT app in web/dist — run `cd web && npm install && npm run build` first.

Two modes:
- demo mode: static server on web/dist only; app falls back to synthetic data.
- live mode: real FastAPI server on a temp project; asserts the save actually
  writes gold.coco.json (the llm-never-mutated invariant, end to end).

Skipped automatically if playwright is not installed.
"""
import functools
import http.server
import json
import shutil
import socketserver
import tempfile
import threading
from pathlib import Path

import pytest

pytest.importorskip("playwright")
from playwright.sync_api import sync_playwright  # noqa: E402

from sam import coco  # noqa: E402
from sam.server import create_app  # noqa: E402

WEB_DIR = Path(__file__).resolve().parent.parent / "web"
DIST_DIR = WEB_DIR / "dist"

pytestmark = pytest.mark.skipif(
    not (DIST_DIR / "index.html").is_file(), reason="web/dist not built (npm run build)"
)


def _serve(handler_factory):
    srv = socketserver.TCPServer(("127.0.0.1", 0), handler_factory)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv, srv.server_address[1]


@pytest.fixture(scope="module")
def browsers():
    with sync_playwright() as p:
        yield p


@pytest.fixture
def demo_url():
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(DIST_DIR))
    srv, port = _serve(handler)
    yield f"http://127.0.0.1:{port}/"
    srv.shutdown()


@pytest.fixture
def live_url():
    import uvicorn

    d = Path(tempfile.mkdtemp())
    (d / "images").mkdir()
    (d / "annotations").mkdir()
    from PIL import Image

    Image.new("RGB", (200, 150), (90, 90, 90)).save(d / "images" / "img1.png")
    c = coco.new_coco()
    c["images"].append({"id": 1, "file_name": "img1.png", "width": 200, "height": 150})
    c["annotations"].append({"id": 1, "image_id": 1, "category_id": 1,
                             "bbox": [20, 20, 60, 40], "area": 2400, "iscrowd": 0})
    c["categories"] = [{"id": 1, "name": "cat"}]
    coco.save(d / "annotations" / "llm.coco.json", c)

    config = uvicorn.Config(create_app(str(d)), host="127.0.0.1", port=0, log_level="warning")
    server = uvicorn.Server(config)
    threading.Thread(target=server.run, daemon=True).start()
    for _ in range(50):
        if server.started:
            break
        import time
        time.sleep(0.1)
    port = server.servers[0].sockets[0].getsockname()[1]
    yield f"http://127.0.0.1:{port}/", d
    server.should_exit = True
    shutil.rmtree(d, ignore_errors=True)


def _wait_boot(page, n_frames):
    page.wait_for_function(
        f"document.querySelectorAll('[data-testid=filmstrip] [data-testid^=frame-]').length === {n_frames}"
    )


def _state(page):
    return page.evaluate("window.__SAM_DEBUG__.state")


def _img_pt(page, ix, iy):
    """Screen coords of a point in image-space coords (canvas is 1:1 CSS:bitmap)."""
    return page.evaluate(f"""(() => {{
        const r = document.querySelector('[data-testid=canvas-wrap] canvas').getBoundingClientRect();
        const v = window.__SAM_DEBUG__.view;
        return {{x: r.left + v.ox + {ix} * v.scale, y: r.top + v.oy + {iy} * v.scale}};
    }})()""")


def _draw(page, x0, y0, x1, y1):
    page.click("[data-testid=mode-draw]")
    tl, br = _img_pt(page, x0, y0), _img_pt(page, x1, y1)
    page.mouse.move(tl["x"], tl["y"])
    page.mouse.down()
    page.mouse.move(br["x"], br["y"], steps=5)
    page.mouse.up()


def test_demo_boot_filmstrip_and_banner(browsers, demo_url):
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        assert "demo" in page.text_content("[data-testid=rail-status]")
        assert _state(page)["live"] is False
        assert _state(page)["gold"]["annotations"]  # deterministic demo fixtures
    finally:
        page.context.browser.close()


def test_demo_canvas_is_not_css_scaled(browsers, demo_url):
    """The canvas bitmap must be displayed 1:1: a CSS max-width/max-height would
    rescale it, so drawn boxes drift off the image (the 'boxes are off' bug)."""
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        assert page.evaluate(
            "(() => { const c = document.querySelector('[data-testid=canvas-wrap] canvas');"
            " return Math.abs(c.clientWidth - c.width / (window.devicePixelRatio || 1)) < 1"
            " && Math.abs(c.clientHeight - c.height / (window.devicePixelRatio || 1)) < 1 })()"
        )
    finally:
        page.context.browser.close()


def test_demo_draw_marks_edited_and_save_is_noop(browsers, demo_url):
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        assert page.locator("[data-testid=save-gold]").is_disabled()

        before = len(_state(page)["gold"]["annotations"])
        _draw(page, 300, 300, 500, 420)
        page.wait_for_function(
            f"window.__SAM_DEBUG__.state.gold.annotations.length === {before + 1}"
        )
        assert page.evaluate("window.__SAM_DEBUG__.state.editedFrames.size") == 1

        page.click("[data-testid=save-gold]")
        page.wait_for_function(
            "document.querySelector('[data-testid=save-hint]').textContent.includes('Demo mode')"
        )
        assert not _state(page)["dirty"]
    finally:
        page.context.browser.close()


def test_live_save_writes_gold_never_touches_llm(browsers, live_url):
    url, d = live_url
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(url)
        _wait_boot(page, 1)
        assert "img1.png" in _state(page)["railStatus"] or _state(page)["project"] == Path(d).name

        llm_before = json.loads((d / "annotations" / "llm.coco.json").read_text())
        _draw(page, 100, 80, 160, 120)
        page.wait_for_function(
            "window.__SAM_DEBUG__.state.dirty === true"
        )
        page.click("[data-testid=save-gold]")
        page.wait_for_function(
            "window.__SAM_DEBUG__.state.dirty === false"
        )

        gold = coco.load(d / "annotations" / "gold.coco.json")
        assert len(gold["annotations"]) == 2
        assert gold["annotations"][-1]["bbox"] == [100, 80, 60, 40]
        # llm subset is untouched
        llm_after = json.loads((d / "annotations" / "llm.coco.json").read_text())
        assert llm_after == llm_before
    finally:
        page.context.browser.close()

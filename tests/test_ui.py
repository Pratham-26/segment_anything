"""Browser tests for the review UI (web/) via Playwright.

Two modes:
- demo mode: static server on web/ only; app falls back to synthetic data.
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
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(WEB_DIR))
    srv, port = _serve(handler)
    yield f"http://127.0.0.1:{port}/index.html"
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
    yield f"http://127.0.0.1:{port}/index.html", d
    server.should_exit = True
    shutil.rmtree(d, ignore_errors=True)


def _wait_boot(page, n_frames):
    page.wait_for_function(f"document.querySelectorAll('.frame').length === {n_frames}")


def _gold_count(page):
    return page.evaluate("state.gold.annotations.length")


def _img_pt(page, ix, iy):
    """Screen coords of a point in image-space coords."""
    return page.evaluate(f"""(() => {{
        const r = canvas.getBoundingClientRect();
        return {{x: r.left + ox + {ix} * scale, y: r.top + oy + {iy} * scale}};
    }})()""")


def test_demo_boot_filmstrip_and_banner(browsers, demo_url):
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        assert "demo" in page.text_content("#project-status")
        assert page.evaluate("state.live") is False
        assert _gold_count(page) == 8  # deterministic demo fixtures
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
            "Math.abs(canvas.clientWidth - canvas.width / (window.devicePixelRatio || 1)) < 1 "
            "&& Math.abs(canvas.clientHeight - canvas.height / (window.devicePixelRatio || 1)) < 1")
        assert page.evaluate("parseFloat(canvas.style.width) === canvas.clientWidth")
    finally:
        page.context.browser.close()


def test_demo_draw_marks_edited_and_save_is_noop(browsers, demo_url):
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        assert page.locator("#save-gold").is_disabled()

        page.keyboard.press("d")  # draw mode
        tl = _img_pt(page, 300, 300)
        br = _img_pt(page, 500, 420)
        page.mouse.move(tl["x"], tl["y"])
        page.mouse.down()
        page.mouse.move(br["x"], br["y"], steps=5)
        page.mouse.up()

        assert _gold_count(page) == 9
        assert page.evaluate("state.editedFrames.size") == 1
        assert not page.locator("#save-gold").is_disabled()

        page.click("#save-gold")
        page.wait_for_function("document.querySelector('#save-hint').textContent.includes('Demo mode')")
        assert _gold_count(page) == 9  # still client-side only
    finally:
        page.context.browser.close()


def test_demo_select_and_delete_box(browsers, demo_url):
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(demo_url)
        _wait_boot(page, 4)
        # image 1's first demo box starts at bbox [80,120,...]; click inside it
        pt = _img_pt(page, 120, 150)
        page.mouse.click(pt["x"], pt["y"])
        assert page.evaluate("selection?.ann?.id") is not None

        page.keyboard.press("Delete")
        assert _gold_count(page) == 7
        assert page.evaluate("selection") is None
    finally:
        page.context.browser.close()


def test_live_save_writes_gold_coco(browsers, live_url):
    url, proj = live_url
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(url)
        _wait_boot(page, 1)
        assert page.evaluate("state.live") is True
        assert "llm boxes: 1" in page.text_content("#frame-stats")

        # move the existing box, then save
        page.keyboard.press("b")  # browse mode
        pt = _img_pt(page, 50, 40)  # inside bbox [20,20,60,40]
        page.mouse.move(pt["x"], pt["y"])
        page.mouse.down()
        page.mouse.move(pt["x"] + 30, pt["y"] + 20, steps=5)
        page.mouse.up()
        page.click("#save-gold")
        page.wait_for_function("document.querySelector('#save-hint').textContent.includes('Saved')")

        gold = json.loads((proj / "annotations" / "gold.coco.json").read_text())
        assert gold["annotations"][0]["bbox"] != [20, 20, 60, 40]  # moved
        llm = json.loads((proj / "annotations" / "llm.coco.json").read_text())
        assert llm["annotations"][0]["bbox"] == [20, 20, 60, 40]  # llm untouched
    finally:
        page.context.browser.close()


def test_live_export_button_downloads_zip(browsers, live_url):
    url, proj = live_url
    page = browsers.chromium.launch().new_page()
    try:
        page.goto(url)
        _wait_boot(page, 1)
        page.click("[data-tab='results']")  # export lives in the Results tab
        assert page.locator(".export-row").is_visible()  # live mode shows export

        with page.expect_download() as dl:
            page.click(".export-row a:first-child")
        download = dl.value
        assert download.suggested_filename.endswith(".zip")
        import zipfile
        path = download.path()
        with zipfile.ZipFile(path) as z:
            names = z.namelist()
        assert "_annotations.coco.json" in names
        assert "img1.png" in names
    finally:
        page.context.browser.close()

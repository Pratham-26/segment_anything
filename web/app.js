/* Annotation Light Table — frontend logic.
   Talks to the FastAPI server (/api/*); falls back to synthetic demo data when
   served without a backend (design preview). All gold edits are client-side
   until "Save gold" PUTs annotations/gold.coco.json. */
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const CLASS_COLORS = ["#4cc2a8", "#e8a13c", "#e05656", "#7aa5e0", "#c88ae0", "#d8d05a", "#e08a9a", "#8ad0c0"];

/* ---------- state ---------- */
const state = {
  images: [],            // [{id, file_name, width, height}]
  current: null,         // image id
  llm: {},               // image_id -> [ann]
  gold: null,            // working COCO dict (copy-on-write from llm)
  dirty: false,
  mode: "browse",
  activeClass: null,
  categories: [],        // [{id, name}]
  live: false,           // true once /api/status answers
};

/* ---------- API with graceful fallback to synthetic demo data ---------- */
async function api(path, opts) {
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

async function boot() {
  try {
    const status = await api("/api/status");
    state.live = true;
    $("#project-status").textContent = `project: ${status.project ?? "loaded"}`;
    await loadReal();
  } catch {
    $("#project-status").textContent = "demo data — no server attached";
    loadDemo();
  }
}

async function loadReal() {
  const cocoData = await api("/api/annotations/llm").catch(() => null);
  const goldData = await api("/api/annotations/gold").catch(() => null);
  hydrate(cocoData, goldData);
}

/* Synthetic fixtures so the design previews truthfully. Labeled demo in the rail. */
function loadDemo() {
  const mk = (name, w, h, i) => ({ id: i + 1, file_name: name, width: w, height: h });
  const imgs = [
    mk("page_001.png", 1600, 1200, 0),
    mk("page_002.png", 1600, 1200, 1),
    mk("scan_A.png", 1200, 1600, 2),
    mk("photo_street.jpg", 1920, 1080, 3),
  ];
  const cats = [
    { id: 1, name: "signature" },
    { id: 2, name: "date" },
    { id: 3, name: "pedestrian" },
  ];
  const anns = [];
  let aid = 1;
  for (const img of imgs) {
    const n = 1 + (img.id % 3);
    for (let k = 0; k < n; k++) {
      const bw = 140 + ((img.id * 53 + k * 91) % 220);
      const bh = 60 + ((img.id * 31 + k * 47) % 90);
      anns.push({
        id: aid++,
        image_id: img.id,
        category_id: 1 + ((img.id + k) % 3),
        bbox: [80 + k * 260, 120 + k * 180, bw, bh],
        area: bw * bh,
        iscrowd: 0,
      });
    }
  }
  hydrate(
    { images: imgs, annotations: anns, categories: cats },
    null
  );
}

function hydrate(cocoLlm, goldCoco) {
  if (!cocoLlm) { showEmpty(true); return; }
  state.images = cocoLlm.images;
  state.categories = cocoLlm.categories;
  state.llm = {};
  for (const a of cocoLlm.annotations) {
    (state.llm[a.image_id] ??= []).push(a);
  }
  // gold starts as a copy of llm (or loads existing); never mutates llm
  state.gold = goldCoco ? structuredClone(goldCoco)
    : structuredClone({ images: cocoLlm.images, annotations: cocoLlm.annotations, categories: cocoLlm.categories });
  state.activeClass = state.categories[0]?.name ?? null;
  fillClassSelect();
  buildFilmstrip();
  showEmpty(state.images.length === 0);
  selectImage(state.images[0]?.id ?? null);
}

function showEmpty(on) { $("#review-empty").classList.toggle("is-visible", on); }

/* ---------- class select & filmstrip ---------- */
function fillClassSelect() {
  const sel = $("#class-select");
  sel.innerHTML = "";
  for (const c of state.categories) {
    const opt = document.createElement("option");
    opt.value = c.name; opt.textContent = c.name;
    sel.appendChild(opt);
  }
  sel.value = state.activeClass;
}
$("#class-select")?.addEventListener("change", e => { state.activeClass = e.target.value; });

function catColor(catId) {
  const idx = state.categories.findIndex(c => c.id === catId);
  return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0];
}
function catName(catId) {
  return state.categories.find(c => c.id === catId)?.name ?? "?";
}

/* gold anns carry original ids; track per-frame edit state explicitly */
state.editedFrames = new Set();

function buildFilmstrip() {
  const strip = $("#filmstrip");
  strip.innerHTML = "";
  for (const img of state.images) {
    const b = document.createElement("button");
    b.className = "frame"; b.dataset.id = img.id;
    b.title = img.file_name;
    const im = document.createElement("img");
    im.src = state.live ? `/api/image/${encodeURIComponent(img.file_name)}` : demoThumb(img);
    im.alt = "";
    b.appendChild(im);
    b.insertAdjacentHTML("beforeend", '<span class="lamp" aria-hidden="true"></span>');
    b.addEventListener("click", () => selectImage(img.id));
    strip.appendChild(b);
  }
}
function demoThumb(img) {
  // tiny synthetic placeholder: deterministic two-tone SVG
  const hue = (img.id * 67) % 360;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${img.width}' height='${img.height}'><rect width='100%' height='100%' fill='hsl(${hue},18%,26%)'/><rect x='12%' y='20%' width='46%' height='60%' fill='hsl(${hue},30%,40%)'/><rect x='52%' y='34%' width='30%' height='42%' fill='hsl(${hue},24%,33%)'/></svg>`;
  return "data:image/svg+xml," + encodeURIComponent(svg);
}

function updateLamps() {
  $$(".frame").forEach(f => f.classList.toggle("done", state.editedFrames.has(+f.dataset.id)));
}

function selectImage(id) {
  state.current = id;
  $$(".frame").forEach(f => f.classList.toggle("is-current", +f.dataset.id === id));
  const wrap = $("#canvas-wrap");
  wrap.classList.remove("lit"); void wrap.offsetWidth; // restart lamp animation
  if (id != null) wrap.classList.add("lit");
  loadCanvas();
  updateStats();
  showEmpty(id == null);
}

function updateStats() {
  const l = (state.llm[state.current] ?? []).length;
  const g = state.gold.annotations.filter(a => a.image_id === state.current).length;
  const edited = state.editedFrames.has(state.current);
  $("#frame-stats").textContent =
    `${state.current ? $("#filmstrip .is-current")?.title ?? "" : "—"}\n` +
    `llm boxes: ${l}\ngold boxes: ${g}${edited ? "\n● unsaved edits" : ""}`;
}

/* ---------- canvas editor ---------- */
const canvas = $("#editor");
const ctx = canvas.getContext("2d");
let scale = 1, ox = 0, oy = 0;   // image -> canvas transform
let drag = null;                 // {kind:'new'|'move'|'resize', ...}

function goldAnnsFor(imgId) {
  return state.gold.annotations.filter(a => a.image_id === imgId);
}

function loadCanvas() {
  const img = state.images.find(i => i.id === state.current);
  if (!img) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
  canvas.classList.add("is-loading");
  const base = new Image();
  base.onload = () => {
    canvas.classList.remove("is-loading");
    const maxW = canvas.parentElement.clientWidth - 64;
    const maxH = canvas.parentElement.clientHeight - 96;
    scale = Math.min(maxW / base.width, maxH / base.height, 1);
    ox = (canvas.parentElement.clientWidth - base.width * scale) / 2;
    oy = (canvas.parentElement.clientHeight - base.height * scale) / 2;
    draw(base);
  };
  base.src = state.live ? `/api/image/${encodeURIComponent(img.file_name)}` : demoThumb(img);
}

let baseImg = null;
function draw(img) {
  baseImg = img;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth, H = canvas.parentElement.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (!img) return;
  ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale);

  const selected = selection?.ann;
  for (const a of goldAnnsFor(state.current)) {
    const isSel = a === selected;
    const [x, y, w, h] = a.bbox.map(v => v * scale);
    ctx.lineWidth = isSel ? 2.5 : 1.5;
    ctx.strokeStyle = catColor(a.category_id);
    ctx.strokeRect(ox + x, oy + y, w, h);
    // label chip: mono, disc well carries color, text stays ivory
    ctx.font = "11px 'JetBrains Mono', monospace";
    const label = catName(a.category_id);
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(20,22,26,0.85)";
    ctx.fillRect(ox + x, oy + y - 16, tw + 14, 15);
    ctx.fillStyle = catColor(a.category_id);
    ctx.fillRect(ox + x + 3, oy + y - 12, 6, 6);
    ctx.fillStyle = "#e6e2d8";
    ctx.fillText(label, ox + x + 13, oy + y - 4.5);
    if (isSel) drawHandles(a);
  }
}

function drawHandles(a) {
  const [x, y, w, h] = a.bbox.map(v => v * scale);
  ctx.fillStyle = "#14161a";
  ctx.strokeStyle = "#e6e2d8";
  ctx.lineWidth = 1.5;
  for (const [hx, hy] of handlePts(x, y, w, h)) {
    ctx.beginPath(); ctx.rect(ox + hx - 4, oy + hy - 4, 8, 8); ctx.fill(); ctx.stroke();
  }
}
function handlePts(x, y, w, h) {
  return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
}

let selection = null; // {ann}

function toImgCoords(e) {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale];
}
function hitHandle(e) {
  if (!selection) return null;
  const [mx, my] = toImgCoords(e);
  const [x, y, w, h] = selection.ann.bbox;
  for (const [i, [hx, hy]] of handlePts(x, y, w, h).entries()) {
    if (Math.abs(mx - hx) < 8 / scale && Math.abs(my - hy) < 8 / scale) return i;
  }
  return null;
}
function hitAnn(e) {
  const [mx, my] = toImgCoords(e);
  const anns = goldAnnsFor(state.current);
  for (let i = anns.length - 1; i >= 0; i--) {
    const [x, y, w, h] = anns[i].bbox;
    if (mx >= x && mx <= x + w && my >= y && my <= y + h) return anns[i];
  }
  return null;
}

canvas.addEventListener("pointerdown", e => {
  if (state.current == null) return;
  canvas.setPointerCapture(e.pointerId);
  const [mx, my] = toImgCoords(e);
  if (state.mode === "draw") {
    drag = { kind: "new", x0: mx, y0: my, x1: mx, y1: my };
    selection = null;
  } else {
    const hi = hitHandle(e);
    if (hi != null && selection) {
      drag = { kind: "resize", corner: hi, ann: selection.ann, orig: [...selection.ann.bbox] };
    } else {
      const ann = hitAnn(e);
      selection = ann ? { ann } : null;
      if (ann) drag = { kind: "move", ann, start: [mx, my], orig: [...ann.bbox] };
    }
  }
});

canvas.addEventListener("pointermove", e => {
  if (!drag || state.current == null) { draw(baseImg); return; }
  const [mx, my] = toImgCoords(e);
  const img = state.images.find(i => i.id === state.current);
  const clamp = (v, max) => Math.max(0, Math.min(v, max));
  if (drag.kind === "new") {
    drag.x1 = clamp(mx, img.width); drag.y1 = clamp(my, img.height);
    previewNew();
  } else if (drag.kind === "move") {
    const dx = clamp(mx, img.width) - drag.start[0], dy = clamp(my, img.height) - drag.start[1];
    drag.ann.bbox = [drag.orig[0] + dx, drag.orig[1] + dy, drag.orig[2], drag.orig[3]].map(v => Math.max(0, Math.round(v)));
    markEdited();
  } else if (drag.kind === "resize") {
    // rebuild corners from the original bbox
    const bx0 = drag.orig[0], by0 = drag.orig[1], bx1 = bx0 + drag.orig[2], by1 = by0 + drag.orig[3];
    const px = clamp(mx, img.width), py = clamp(my, img.height);
    let nx0 = bx0, ny0 = by0, nx1 = bx1, ny1 = by1;
    if (drag.corner === 0) { nx0 = px; ny0 = py; }
    if (drag.corner === 1) { nx1 = px; ny0 = py; }
    if (drag.corner === 2) { nx0 = px; ny1 = py; }
    if (drag.corner === 3) { nx1 = px; ny1 = py; }
    drag.ann.bbox = [Math.min(nx0, nx1), Math.min(ny0, ny1), Math.abs(nx1 - nx0), Math.abs(ny1 - ny0)].map(Math.round);
    markEdited();
  }
  draw(baseImg);
});

function previewNew() {
  draw(baseImg);
  const x = ox + Math.min(drag.x0, drag.x1) * scale, y = oy + Math.min(drag.y0, drag.y1) * scale;
  const w = Math.abs(drag.x1 - drag.x0) * scale, h = Math.abs(drag.y1 - drag.y0) * scale;
  ctx.strokeStyle = "#e6e2d8"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
}

canvas.addEventListener("pointerup", () => {
  if (!drag) return;
  if (drag.kind === "new") {
    const x0 = Math.min(drag.x0, drag.x1), y0 = Math.min(drag.y0, drag.y1);
    const w = Math.abs(drag.x1 - drag.x0), h = Math.abs(drag.y1 - drag.y0);
    if (w > 4 && h > 4) addBox(x0, y0, w, h);
  } else {
    snapAnn(drag.ann);
  }
  drag = null;
  draw(baseImg);
  updateStats();
});

let nextAnnId = 100000;
function addBox(x, y, w, h) {
  const cat = state.categories.find(c => c.name === state.activeClass) ?? state.categories[0];
  if (!cat) return;
  const ann = { id: nextAnnId++, image_id: state.current, category_id: cat.id, bbox: [x, y, w, h].map(Math.round), area: w * h, iscrowd: 0 };
  state.gold.annotations.push(ann);
  selection = { ann };
  markEdited();
}
function snapAnn(ann) {
  const img = state.images.find(i => i.id === state.current);
  ann.bbox[0] = Math.max(0, Math.min(ann.bbox[0], img.width - 1));
  ann.bbox[1] = Math.max(0, Math.min(ann.bbox[1], img.height - 1));
  ann.bbox[2] = Math.max(1, Math.min(ann.bbox[2], img.width - ann.bbox[0]));
  ann.bbox[3] = Math.max(1, Math.min(ann.bbox[3], img.height - ann.bbox[1]));
}
function markEdited() {
  if (state.current != null) state.editedFrames.add(state.current);
  state.dirty = true;
  $("#save-gold").disabled = false;
  $("#save-hint").textContent = "";
  updateLamps();
}

document.addEventListener("keydown", e => {
  if (e.target.matches("input, select, textarea")) return;
  if (e.key === "Escape") { selection = null; draw(baseImg); }
  if ((e.key === "Delete" || e.key === "Backspace") && selection) {
    const i = state.gold.annotations.indexOf(selection.ann);
    if (i >= 0) state.gold.annotations.splice(i, 1);
    selection = null; markEdited(); draw(baseImg); updateStats();
  }
  if (e.key === "b") setMode("browse");
  if (e.key === "d") setMode("draw");
});

$$(".mode").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
function setMode(m) {
  state.mode = m;
  $$(".mode").forEach(b => b.classList.toggle("is-active", b.dataset.mode === m));
  canvas.style.cursor = m === "draw" ? "crosshair" : "default";
}

$("#save-gold").disabled = true;
$("#save-gold").addEventListener("click", async () => {
  try {
    if (state.live) {
      await api("/api/annotations/gold", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state.gold),
      });
    }
    state.dirty = false;
    $("#save-gold").disabled = true;
    $("#save-hint").textContent = state.live ? "Saved to annotations/gold.coco.json" : "Demo mode — nothing written";
    setTimeout(() => { $("#save-hint").textContent = ""; }, 4000);
    updateStats();
  } catch (err) {
    $("#save-hint").textContent = `Save failed: ${err.message}`;
  }
});

/* ---------- tabs ---------- */
$$(".stage").forEach(b => b.addEventListener("click", () => {
  $$(".stage").forEach(x => x.classList.remove("is-active"));
  b.classList.add("is-active");
  $$(".tab").forEach(t => t.classList.remove("is-active"));
  $(`#tab-${b.dataset.tab}`).classList.add("is-active");
  if (b.dataset.tab === "results") loadResults();
}));

/* ---------- ingest / label / train / results wiring ---------- */
const dropzone = $("#dropzone");
const fileInput = Object.assign(document.createElement("input"), { type: "file", multiple: true, accept: "image/*,.pdf" });
fileInput.style.display = "none";
dropzone.appendChild(fileInput);
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("dragover", e => { e.preventDefault(); dropzone.classList.add("is-over"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("is-over"));
dropzone.addEventListener("drop", e => { e.preventDefault(); dropzone.classList.remove("is-over"); uploadFiles(e.dataTransfer.files); });
fileInput.addEventListener("change", () => uploadFiles(fileInput.files));

async function uploadFiles(files) {
  if (!state.live || !files.length) return;
  const fd = new FormData();
  for (const f of files) fd.append("files", f);
  logLine("#ingest-log", `uploading ${files.length} file(s)…`);
  try {
    const r = await api("/api/ingest", { method: "POST", body: fd });
    logLine("#ingest-log", `copied ${r.copied}, skipped ${r.skipped}`);
    await loadReal();
  } catch (err) { logLine("#ingest-log", `ingest failed: ${err.message}`); }
  fileInput.value = "";
}

$("#label-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!state.live) { logLine("#label-log", `[demo] sam label --query "${$("#query-input").value}" --vlm "${$("#vlm-input").value}"`); return; }
  const vlm = $("#vlm-input").value;
  logLine("#label-log", `labeling with ${vlm}… (one VLM call per image; slow)`);
  try {
    const r = await api(`/api/label?query=${encodeURIComponent($("#query-input").value)}&model=${encodeURIComponent(vlm)}`);
    logLine("#label-log", `labeled ${r.labeled ?? "?"}${r.failures?.length ? `, ${r.failures.length} failed` : ""}`);
    await loadReal();
  } catch (err) { logLine("#label-log", `label failed: ${err.message}`); }
});

$("#train-form").addEventListener("submit", async e => {
  e.preventDefault();
  if (!state.live) { logLine("#run-list", `[demo] variant=${$("#variant-select").value} epochs=${$("#epochs-input").value}`); return; }
  logLine("#run-list", "training started — split runs automatically (10% val, gold forced into val)");
  try {
    const r = await api(`/api/train?variant=${$("#variant-select").value}&epochs=${$("#epochs-input").value}`);
    logLine("#run-list", `done: run=${r.run} train=${r.train_images} val=${r.val_images}`);
    loadResults();
  } catch (err) { logLine("#run-list", `train failed: ${err.message}`); }
});

async function loadResults() {
  if (!state.live) return;
  try {
    const m = await api("/api/metrics");
    $('[data-metric="map50"]').textContent = m.map50;
    $('[data-metric="map5095"]').textContent = m.map50_95;
    const rows = Object.entries(m.per_class ?? {})
      .map(([k, v]) => `<div class="pc-row mono"><span>${k}</span><span>${v}</span></div>`).join("");
    $("#per-class").innerHTML = rows || "<p class='tray-hint'>no per-class AP in this run.</p>";
  } catch { /* no runs with metrics yet */ }
  try {
    const c = await api("/api/corrections");
    $('[data-metric="corr"]').textContent = c.correction_rate;
  } catch { /* no gold yet */ }
}

function logLine(sel, text) {
  $(sel).textContent += text + "\n";
}

boot();

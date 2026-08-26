"""Ingest: copy images into project, split PDFs into page PNGs, dedup by hash."""
import hashlib
import shutil
from pathlib import Path

IMAGE_EXTS = {".jpg", ".jpeg", ".png"}

def _sha1(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()

def _existing_hashes(images_dir):
    return {_sha1(p) for p in images_dir.iterdir() if p.suffix.lower() in IMAGE_EXTS}

def _split_pdf(pdf_path, images_dir, stem, seen):
    """Rasterize PDF pages to PNGs via pypdfium2. Returns count of pages written."""
    import pypdfium2 as pdfium

    written = 0
    pdf = pdfium.PdfDocument(pdf_path)
    try:
        for i, page in enumerate(pdf):
            bitmap = page.render(scale=2.0)
            pil = bitmap.to_pil()
            name = f"{stem}_p{i + 1:03d}.png"
            out = images_dir / name
            pil.save(out)
            h = _sha1(out)
            if h in seen:
                out.unlink()
                continue
            seen.add(h)
            written += 1
    finally:
        pdf.close()
    return written

def ingest(paths, project):
    """Ingest files/dirs into <project>/images/. Returns summary dict."""
    project = Path(project)
    images_dir = project / "images"
    images_dir.mkdir(parents=True, exist_ok=True)
    seen = _existing_hashes(images_dir)

    copied = split = skipped = 0
    files = []
    for p in paths:
        p = Path(p)
        if p.is_dir():
            files.extend(sorted(q for q in p.iterdir() if q.is_file()))
        else:
            files.append(p)

    for f in files:
        if not f.exists():
            skipped += 1
            continue
        suffix = f.suffix.lower()
        if suffix == ".pdf":
            split += _split_pdf(f, images_dir, f.stem, seen)
        elif suffix in IMAGE_EXTS:
            h = _sha1(f)
            if h in seen:
                skipped += 1
                continue
            seen.add(h)
            dest = images_dir / f.name
            if dest.exists():  # same name, different content -> number it
                dest = images_dir / f"{f.stem}_{h[:6]}{f.suffix}"
            shutil.copy2(f, dest)
            copied += 1
        else:
            skipped += 1

    return {"images": len(list(images_dir.iterdir())), "copied": copied, "pdf_pages": split, "skipped": skipped}

import type { AnnT } from "./types"

export type BBox = AnnT["bbox"]

export function clamp(v: number, max: number): number {
  return Math.max(0, Math.min(v, max))
}

/** Corner points of a bbox: 0=top-left, 1=top-right, 2=bottom-left, 3=bottom-right. */
export function corners(b: BBox): Array<[number, number]> {
  const [x, y, w, h] = b
  return [
    [x, y],
    [x + w, y],
    [x, y + h],
    [x + w, y + h],
  ]
}

/** Index of the corner within `tol` image units of (mx, my), or null. */
export function hitCorner(mx: number, my: number, b: BBox, tol: number): number | null {
  const pts = corners(b)
  for (let i = 0; i < pts.length; i++) {
    const [hx, hy] = pts[i]
    if (Math.abs(mx - hx) < tol && Math.abs(my - hy) < tol) return i
  }
  return null
}

/** True when (mx, my) is inside the bbox. */
export function hitBox(mx: number, my: number, b: BBox): boolean {
  const [x, y, w, h] = b
  return mx >= x && mx <= x + w && my >= y && my <= y + h
}

/** Normalized, rounded bbox from a drag between two points. */
export function dragRect(x0: number, y0: number, x1: number, y1: number): BBox {
  return [
    Math.round(Math.min(x0, x1)),
    Math.round(Math.min(y0, y1)),
    Math.round(Math.abs(x1 - x0)),
    Math.round(Math.abs(y1 - y0)),
  ]
}

export const MIN_BOX = 4

/** A drag counts as a box only when big enough. */
export function isBoxSized(w: number, h: number): boolean {
  return w > MIN_BOX && h > MIN_BOX
}

/** Move a bbox by (dx, dy), clamped to the image. */
export function moveBox(b: BBox, dx: number, dy: number, imgW: number, imgH: number): BBox {
  return [clamp(b[0] + dx, imgW), clamp(b[1] + dy, imgH), b[2], b[3]].map((v) =>
    Math.max(0, Math.round(v)),
  ) as BBox
}

/** Resize by dragging one corner; the dragged point is clamped to the image. */
export function resizeCorner(b: BBox, corner: number, px: number, py: number, imgW: number, imgH: number): BBox {
  const bx0 = b[0]
  const by0 = b[1]
  const bx1 = b[0] + b[2]
  const by1 = b[1] + b[3]
  const px2 = clamp(px, imgW)
  const py2 = clamp(py, imgH)
  let nx0 = bx0
  let ny0 = by0
  let nx1 = bx1
  let ny1 = by1
  if (corner === 0) {
    nx0 = px2
    ny0 = py2
  } else if (corner === 1) {
    nx1 = px2
    ny0 = py2
  } else if (corner === 2) {
    nx0 = px2
    ny1 = py2
  } else {
    nx1 = px2
    ny1 = py2
  }
  return [
    Math.round(Math.min(nx0, nx1)),
    Math.round(Math.min(ny0, ny1)),
    Math.round(Math.abs(nx1 - nx0)),
    Math.round(Math.abs(ny1 - ny0)),
  ]
}

/** Keep a bbox fully inside the image with at least 1px extent. */
export function snapBox(b: BBox, imgW: number, imgH: number): BBox {
  const x = Math.max(0, Math.min(b[0], imgW - 1))
  const y = Math.max(0, Math.min(b[1], imgH - 1))
  const w = Math.max(1, Math.min(b[2], imgW - x))
  const h = Math.max(1, Math.min(b[3], imgH - y))
  return [x, y, w, h]
}

import type { AnnT, Coco, ImageT } from "./types"

/** Synthetic fixtures so the UI previews without a server (demo mode). */
export function demoCoco(): Coco {
  const mk = (name: string, w: number, h: number, i: number): ImageT => ({
    id: i + 1,
    file_name: name,
    width: w,
    height: h,
  })
  const images: ImageT[] = [
    mk("page_001.png", 1600, 1200, 0),
    mk("page_002.png", 1600, 1200, 1),
    mk("scan_A.png", 1200, 1600, 2),
    mk("photo_street.jpg", 1920, 1080, 3),
  ]
  const categories = [
    { id: 1, name: "signature" },
    { id: 2, name: "date" },
    { id: 3, name: "pedestrian" },
  ]
  const annotations: AnnT[] = []
  let aid = 1
  for (const img of images) {
    const n = 1 + (img.id % 3)
    for (let k = 0; k < n; k++) {
      const bw = 140 + ((img.id * 53 + k * 91) % 220)
      const bh = 60 + ((img.id * 31 + k * 47) % 90)
      annotations.push({
        id: aid++,
        image_id: img.id,
        category_id: 1 + ((img.id + k) % 3),
        bbox: [80 + k * 260, 120 + k * 180, bw, bh] as [number, number, number, number],
        area: bw * bh,
        iscrowd: 0,
      })
    }
  }
  return { images, annotations, categories }
}

/** Deterministic two-tone SVG placeholder for demo thumbnails. */
export function demoThumb(img: ImageT): string {
  const hue = (img.id * 67) % 360
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${img.width}' height='${img.height}'><rect width='100%' height='100%' fill='hsl(${hue},18%,26%)'/><rect x='12%' y='20%' width='46%' height='60%' fill='hsl(${hue},30%,40%)'/><rect x='52%' y='34%' width='30%' height='42%' fill='hsl(${hue},24%,33%)'/></svg>`
  return "data:image/svg+xml," + encodeURIComponent(svg)
}

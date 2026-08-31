/* Interactive annotation canvas: browse (select/move/resize/delete) and draw
   (drag a new box). All bbox math lives in lib/geometry.ts (pure, tested);
   this component maps pointer events onto it and redraws. */
import { useCallback, useEffect, useRef } from "react"
import { useStudio } from "@/hooks/useStudio"
import { imageUrl } from "@/lib/api"
import { catColor, catName } from "@/lib/colors"
import { demoThumb } from "@/lib/demo"
import {
  clamp,
  dragRect,
  hitBox,
  hitCorner,
  isBoxSized,
  moveBox,
  resizeCorner,
  snapBox,
} from "@/lib/geometry"
import type { BBox } from "@/lib/geometry"
import type { AnnT } from "@/lib/types"
import { cn } from "@/lib/utils"

type DragState =
  | { kind: "new"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "move"; id: number; startX: number; startY: number; orig: BBox }
  | { kind: "resize"; id: number; corner: number; orig: BBox }

const CANVAS_INSET_X = 64
const CANVAS_INSET_Y = 96
const HANDLE_TOL = 8

let nextAnnId = 100000

export function CanvasEditor() {
  const { state, dispatch } = useStudio()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const baseImgRef = useRef<HTMLImageElement | null>(null)
  const viewRef = useRef({ scale: 1, ox: 0, oy: 0 })
  const selRef = useRef<AnnT | null>(null)
  const dragRef = useRef<DragState | null>(null)

  const currentImg = state.images.find((i) => i.id === state.current) ?? null
  const goldAnns =
    state.current != null
      ? (state.gold?.annotations.filter((a) => a.image_id === state.current) ?? [])
      : []

  // Latest values for stable callbacks.
  const goldAnnsRef = useRef(goldAnns)
  goldAnnsRef.current = goldAnns
  const categoriesRef = useRef(state.categories)
  categoriesRef.current = state.categories
  const currentImgRef = useRef(currentImg)
  currentImgRef.current = currentImg

  const canvasSize = useCallback((): [number, number] => {
    const el = wrapRef.current
    if (!el || el.clientWidth === 0) return [800, 600]
    return [
      Math.max(50, el.clientWidth - CANVAS_INSET_X),
      Math.max(50, el.clientHeight - CANVAS_INSET_Y),
    ]
  }, [])

  const fitView = useCallback(
    (base: HTMLImageElement) => {
      const [W, H] = canvasSize()
      const scale = Math.min(W / base.width, H / base.height, 1)
      viewRef.current = {
        scale,
        ox: (W - base.width * scale) / 2,
        oy: (H - base.height * scale) / 2,
      }
    },
    [canvasSize],
  )

  const redraw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = window.devicePixelRatio || 1
    const [W, H] = canvasSize()
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + "px"
    canvas.style.height = H + "px"
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, H)
    ;(window.__SAM_DEBUG__ ??= {}).view = { scale: viewRef.current.scale, ox: viewRef.current.ox, oy: viewRef.current.oy } // e2e hook

    const img = baseImgRef.current
    if (!img) return
    const { scale, ox, oy } = viewRef.current
    ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale)

    const categories = categoriesRef.current
    const sel = selRef.current
    for (const a of goldAnnsRef.current) {
      const [x, y, w, h] = a.bbox
      const sx = ox + x * scale
      const sy = oy + y * scale
      const sw = w * scale
      const sh = h * scale
      const isSel = sel?.id === a.id
      ctx.lineWidth = isSel ? 2.5 : 1.5
      ctx.strokeStyle = catColor(categories, a.category_id)
      ctx.strokeRect(sx, sy, sw, sh)

      const label = catName(categories, a.category_id)
      ctx.font = "11px monospace"
      const tw = ctx.measureText(label).width
      ctx.fillStyle = "rgba(24,24,27,0.85)"
      ctx.fillRect(sx, sy - 16, tw + 14, 15)
      ctx.fillStyle = catColor(categories, a.category_id)
      ctx.fillRect(sx + 3, sy - 12, 6, 6)
      ctx.fillStyle = "#fafafa"
      ctx.fillText(label, sx + 13, sy - 4.5)

      if (isSel) {
        ctx.fillStyle = "#fafafa"
        ctx.strokeStyle = "#18181b"
        ctx.lineWidth = 1.5
        for (const [hx, hy] of [
          [sx, sy],
          [sx + sw, sy],
          [sx, sy + sh],
          [sx + sw, sy + sh],
        ]) {
          ctx.beginPath()
          ctx.rect(hx - 4, hy - 4, 8, 8)
          ctx.fill()
          ctx.stroke()
        }
      }
    }

    // Dashed preview while drawing a new box; dual-stroke so it reads on any image.
    const drag = dragRef.current
    if (drag?.kind === "new") {
      const x = ox + Math.min(drag.x0, drag.x1) * scale
      const y = oy + Math.min(drag.y0, drag.y1) * scale
      const w = Math.abs(drag.x1 - drag.x0) * scale
      const h = Math.abs(drag.y1 - drag.y0) * scale
      ctx.lineWidth = 3
      ctx.strokeStyle = "rgba(24,24,27,0.7)"
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([4, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = "#fafafa"
      ctx.strokeRect(x, y, w, h)
      ctx.setLineDash([])
    }
  }, [canvasSize])

  // Redraw after every render (annotations, selection, mode changes).
  useEffect(() => {
    redraw()
  })

  // Load the current image and fit the view.
  useEffect(() => {
    const img = currentImg
    if (!img) {
      baseImgRef.current = null
      redraw()
      return
    }
    let cancelled = false
    const base = new Image()
    base.onload = () => {
      if (cancelled) return
      baseImgRef.current = base
      fitView(base)
      redraw()
    }
    base.src = state.live ? imageUrl(img.file_name, state.project) : demoThumb(img)
    return () => {
      cancelled = true
    }
  }, [currentImg, state.live, state.project, fitView, redraw])

  // Refit on window resize; stale offsets would drift boxes off the image.
  useEffect(() => {
    let timer: number | undefined
    const onResize = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (baseImgRef.current) {
          fitView(baseImgRef.current)
          redraw()
        }
      }, 100)
    }
    window.addEventListener("resize", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      window.clearTimeout(timer)
    }
  }, [fitView, redraw])

  // Keyboard: Escape deselects, Delete removes the selection, b/d switch mode.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return
      if (e.key === "Escape") {
        selRef.current = null
        redraw()
      } else if ((e.key === "Delete" || e.key === "Backspace") && selRef.current) {
        dispatch({ type: "deleteAnn", id: selRef.current.id })
        selRef.current = null
        redraw()
      } else if (e.key === "b") {
        dispatch({ type: "setMode", mode: "browse" })
      } else if (e.key === "d") {
        dispatch({ type: "setMode", mode: "draw" })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [dispatch, redraw])

  function toImgCoords(e: React.PointerEvent<HTMLCanvasElement>): [number, number] {
    const r = e.currentTarget.getBoundingClientRect()
    const { scale, ox, oy } = viewRef.current
    return [(e.clientX - r.left - ox) / scale, (e.clientY - r.top - oy) / scale]
  }

  function addBox(x: number, y: number, w: number, h: number) {
    const cat =
      categoriesRef.current.find((c) => c.name === state.activeClass) ?? categoriesRef.current[0]
    const imgId = state.current
    if (!cat || imgId == null) return
    const ann: AnnT = {
      id: nextAnnId++,
      image_id: imgId,
      category_id: cat.id,
      bbox: [x, y, w, h],
      area: w * h,
      iscrowd: 0,
    }
    dispatch({ type: "addBox", ann })
    selRef.current = ann
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (state.current == null) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const [mx, my] = toImgCoords(e)
    if (state.mode === "draw") {
      dragRef.current = { kind: "new", x0: mx, y0: my, x1: mx, y1: my }
      selRef.current = null
    } else {
      const sel = selRef.current
      const corner = sel ? hitCorner(mx, my, sel.bbox, HANDLE_TOL / viewRef.current.scale) : null
      if (sel && corner != null) {
        dragRef.current = { kind: "resize", id: sel.id, corner, orig: [...sel.bbox] }
      } else {
        const ann = [...goldAnnsRef.current].reverse().find((a) => hitBox(mx, my, a.bbox)) ?? null
        selRef.current = ann
        if (ann) {
          dragRef.current = { kind: "move", id: ann.id, startX: mx, startY: my, orig: [...ann.bbox] }
        }
      }
    }
    redraw()
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current
    if (!drag || state.current == null) {
      redraw()
      return
    }
    const img = currentImgRef.current
    if (!img) return
    const [mx, my] = toImgCoords(e)
    if (drag.kind === "new") {
      drag.x1 = clamp(mx, img.width)
      drag.y1 = clamp(my, img.height)
      redraw()
    } else if (drag.kind === "move") {
      const dx = clamp(mx, img.width) - drag.startX
      const dy = clamp(my, img.height) - drag.startY
      dispatch({
        type: "updateAnn",
        id: drag.id,
        bbox: moveBox(drag.orig, dx, dy, img.width, img.height),
      })
    } else {
      dispatch({
        type: "updateAnn",
        id: drag.id,
        bbox: resizeCorner(drag.orig, drag.corner, mx, my, img.width, img.height),
      })
    }
  }

  function onPointerUp() {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const img = currentImgRef.current
    if (drag.kind === "new" && img) {
      const [x, y, w, h] = dragRect(drag.x0, drag.y0, drag.x1, drag.y1)
      if (isBoxSized(w, h)) addBox(x, y, w, h)
    } else if (drag.kind !== "new" && img) {
      const ann = goldAnnsRef.current.find((a) => a.id === drag.id)
      if (ann) {
        dispatch({ type: "updateAnn", id: ann.id, bbox: snapBox(ann.bbox, img.width, img.height) })
      }
    }
    redraw()
  }

  return (
    <div ref={wrapRef} className="relative min-h-0 min-w-0 flex-1" data-testid="canvas-wrap">
      <canvas
        ref={canvasRef}
        aria-label="Annotation canvas"
        data-testid="editor-canvas"
        className={cn(
          "absolute inset-0",
          state.mode === "draw" ? "cursor-crosshair" : "cursor-default",
        )}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  )
}

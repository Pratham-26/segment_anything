import { describe, expect, it } from "vitest"
import {
  corners,
  dragRect,
  hitBox,
  hitCorner,
  isBoxSized,
  moveBox,
  resizeCorner,
  snapBox,
} from "./geometry"

describe("geometry", () => {
  it("lists corners in tl,tr,bl,br order", () => {
    expect(corners([10, 20, 30, 40])).toEqual([
      [10, 20],
      [40, 20],
      [10, 60],
      [40, 60],
    ])
  })

  it("hitCorner finds corners within tolerance only", () => {
    expect(hitCorner(12, 21, [10, 20, 30, 40], 4)).toBe(0)
    expect(hitCorner(39, 59, [10, 20, 30, 40], 4)).toBe(3)
    expect(hitCorner(25, 40, [10, 20, 30, 40], 4)).toBeNull()
  })

  it("hitBox is inclusive of edges", () => {
    expect(hitBox(10, 20, [10, 20, 30, 40])).toBe(true)
    expect(hitBox(40, 60, [10, 20, 30, 40])).toBe(true)
    expect(hitBox(41, 60, [10, 20, 30, 40])).toBe(false)
  })

  it("dragRect normalizes negative drags", () => {
    expect(dragRect(100, 120, 50, 80)).toEqual([50, 80, 50, 40])
  })

  it("isBoxSized rejects tiny drags", () => {
    expect(isBoxSized(4, 5)).toBe(false)
    expect(isBoxSized(5, 5)).toBe(true)
  })

  it("moveBox translates and clamps to the image", () => {
    expect(moveBox([10, 10, 30, 30], 5, 5, 100, 100)).toEqual([15, 15, 30, 30])
    expect(moveBox([90, 90, 30, 30], 50, 50, 100, 100)).toEqual([100, 100, 30, 30])
  })

  it("resizeCorner rebuilds the box from the dragged corner", () => {
    const b: [number, number, number, number] = [10, 10, 30, 30]
    expect(resizeCorner(b, 3, 60, 70, 100, 100)).toEqual([10, 10, 50, 60])
    // dragging tl past br flips the box and stays positive
    expect(resizeCorner(b, 0, 60, 70, 100, 100)).toEqual([40, 40, 20, 30])
    expect(resizeCorner(b, 1, 5, 5, 100, 100)).toEqual([5, 5, 5, 35])
  })

  it("snapBox keeps boxes inside the image with >=1px extent", () => {
    expect(snapBox([-5, -5, 30, 30], 100, 100)).toEqual([0, 0, 30, 30])
    expect(snapBox([95, 95, 30, 30], 100, 100)).toEqual([95, 95, 5, 5])
    expect(snapBox([99, 99, 30, 30], 100, 100)).toEqual([99, 99, 1, 1])
  })
})

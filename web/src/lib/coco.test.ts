import { describe, expect, it } from "vitest"
import { byImage, mergeCoco } from "./coco"
import type { Coco } from "./types"

const llm: Coco = {
  images: [
    { id: 1, file_name: "a.png", width: 100, height: 100 },
    { id: 2, file_name: "b.png", width: 100, height: 100 },
  ],
  annotations: [
    { id: 1, image_id: 1, category_id: 1, bbox: [0, 0, 10, 10], area: 100, iscrowd: 0 },
    { id: 2, image_id: 2, category_id: 1, bbox: [0, 0, 10, 10], area: 100, iscrowd: 0 },
  ],
  categories: [{ id: 1, name: "x" }],
}

const savedGold: Coco = {
  images: [{ id: 1, file_name: "a.png", width: 100, height: 100 }],
  annotations: [
    { id: 1, image_id: 1, category_id: 1, bbox: [5, 5, 20, 20], area: 400, iscrowd: 0 },
  ],
  categories: [{ id: 1, name: "x" }],
}

describe("mergeCoco", () => {
  it("with no gold, working copy equals llm and nothing is edited", () => {
    const { gold, editedFrames } = mergeCoco(llm, null)
    expect(gold).toEqual(llm)
    expect(editedFrames).toEqual([])
  })

  it("saved gold replaces covered frames and keeps llm elsewhere", () => {
    const { gold, editedFrames } = mergeCoco(llm, savedGold)
    expect(gold.images).toEqual(savedGold.images)
    // frame 1 covered by gold, frame 2 still served from llm
    expect(gold.annotations.map((a) => a.id).sort()).toEqual([1, 2])
    const goldAnn = gold.annotations.find((a) => a.image_id === 1)
    expect(goldAnn?.bbox).toEqual([5, 5, 20, 20])
    expect(editedFrames).toEqual([1])
  })

  it("never mutates the llm input (copy-on-write)", () => {
    const before = JSON.stringify(llm)
    const { gold } = mergeCoco(llm, null)
    gold.annotations.push({
      id: 99,
      image_id: 1,
      category_id: 1,
      bbox: [1, 1, 1, 1],
      area: 1,
      iscrowd: 0,
    })
    expect(JSON.stringify(llm)).toBe(before)
  })
})

describe("byImage", () => {
  it("groups annotations per image id", () => {
    const grouped = byImage(llm)
    expect(grouped[1]).toHaveLength(1)
    expect(grouped[2]).toHaveLength(1)
    expect(grouped[3]).toBeUndefined()
  })
})

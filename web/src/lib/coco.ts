import type { Coco } from "./types"

export interface MergedCoco {
  gold: Coco
  editedFrames: number[]
}

/**
 * Build the working gold copy from llm annotations plus an optional saved gold.
 * llm annotations are never mutated: gold is a copy-on-write merge where saved
 * gold frames fully replace llm frames. Returns the set of frame ids already
 * reviewed into gold.
 */
export function mergeCoco(llm: Coco, savedGold: Coco | null): MergedCoco {
  const gold: Coco = JSON.parse(JSON.stringify(llm))
  let editedFrames: number[] = []
  if (savedGold) {
    const covered = new Set(savedGold.images.map((i) => i.id))
    gold.images = JSON.parse(JSON.stringify(savedGold.images))
    gold.annotations = gold.annotations
      .filter((a) => !covered.has(a.image_id))
      .concat(savedGold.annotations)
    editedFrames = [...new Set(savedGold.annotations.map((a) => a.image_id))]
  }
  return { gold, editedFrames }
}

/** Annotations per image id from a COCO dict. */
export function byImage(coco: Coco): Record<number, Coco["annotations"]> {
  const out: Record<number, Coco["annotations"]> = {}
  for (const a of coco.annotations) {
    ;(out[a.image_id] ??= []).push(a)
  }
  return out
}

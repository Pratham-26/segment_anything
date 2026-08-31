import type { CategoryT } from "./types"

export const CLASS_COLORS = [
  "#3ecf8e",
  "#e5b054",
  "#7aa5e0",
  "#c88ae0",
  "#e0565b",
  "#8ad0c0",
  "#d8d05a",
  "#e08a9a",
]

export function catColor(categories: CategoryT[], id: number): string {
  const idx = categories.findIndex((c) => c.id === id)
  return CLASS_COLORS[idx >= 0 ? idx % CLASS_COLORS.length : 0]
}

export function catName(categories: CategoryT[], id: number): string {
  return categories.find((c) => c.id === id)?.name ?? "?"
}

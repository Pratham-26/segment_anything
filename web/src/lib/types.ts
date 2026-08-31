export interface ImageT {
  id: number
  file_name: string
  width: number
  height: number
}

export interface CategoryT {
  id: number
  name: string
}

export interface AnnT {
  id: number
  image_id: number
  category_id: number
  bbox: [number, number, number, number] // [x, y, w, h] in image coords
  area: number
  iscrowd: number
}

export interface Coco {
  images: ImageT[]
  annotations: AnnT[]
  categories: CategoryT[]
}

export interface ProjectT {
  name: string
  stage: string
  images: number
  boxes: number
  gold?: boolean
  metrics?: boolean
}

export interface StatusT {
  project: string
  stage: string
  has_llm: boolean
  query?: string
  vlm?: string
}

export interface MetricsT {
  map50: string
  map50_95: string
  per_class?: Record<string, string>
}

export interface CorrectionsT {
  correction_rate: string
}

export type Tab =
  | "projects"
  | "ingest"
  | "label"
  | "review"
  | "train"
  | "results"

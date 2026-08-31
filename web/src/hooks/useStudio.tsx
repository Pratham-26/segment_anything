/* Central app state. One reducer + one context; views read via useStudio().
   Invariant carried over from the original UI: llm annotations are never
   mutated — edits land in the copy-on-write gold COCO dict. */
import { createContext, useContext, useMemo, useReducer, useRef } from "react"
import type { ReactNode } from "react"
import * as api from "@/lib/api"
import { byImage, mergeCoco } from "@/lib/coco"
import { demoCoco } from "@/lib/demo"
import type { AnnT, Coco, MetricsT, ProjectT, StatusT, Tab } from "@/lib/types"

export type Mode = "browse" | "draw"

export interface StudioState {
  booted: boolean
  live: boolean // true once /api/projects answers
  project: string | null
  railStatus: string
  projects: ProjectT[]
  tab: Tab
  images: Coco["images"]
  categories: Coco["categories"]
  llm: Record<number, AnnT[]>
  gold: Coco | null
  editedFrames: Set<number>
  current: number | null
  dirty: boolean
  mode: Mode
  activeClass: string | null
  query: string
  vlm: string
  metrics: MetricsT | null
  correctionRate: string | null
  error: string | null
}

type Action =
  | { type: "bootDemo" }
  | { type: "setProjects"; projects: ProjectT[] }
  | {
      type: "openProject"
      project: string
      status: StatusT | null
      llm: Coco | null
      gold: Coco | null
    }
  | { type: "setTab"; tab: Tab }
  | { type: "selectImage"; id: number | null }
  | { type: "addBox"; ann: AnnT }
  | { type: "updateAnn"; id: number; bbox: AnnT["bbox"] }
  | { type: "deleteAnn"; id: number }
  | { type: "setMode"; mode: Mode }
  | { type: "setClass"; name: string }
  | { type: "saved" }
  | { type: "results"; metrics: MetricsT | null; correctionRate: string | null }
  | { type: "error"; message: string | null }

const initialState: StudioState = {
  booted: false,
  live: false,
  project: null,
  railStatus: "no project loaded",
  projects: [],
  tab: "projects",
  images: [],
  categories: [],
  llm: {},
  gold: null,
  editedFrames: new Set(),
  current: null,
  dirty: false,
  mode: "browse",
  activeClass: null,
  query: "",
  vlm: "",
  metrics: null,
  correctionRate: null,
  error: null,
}

function reducer(s: StudioState, a: Action): StudioState {
  switch (a.type) {
    case "bootDemo":
      return {
        ...s,
        booted: true,
        live: false,
        railStatus: "demo data — no server attached",
        tab: "review",
        ...hydrate(s, demoCoco(), null),
      }
    case "setProjects":
      return { ...s, projects: a.projects }
    case "openProject":
      return {
        ...s,
        booted: true,
        live: true,
        project: a.project,
        railStatus: a.status ? `project: ${a.status.project} · ${a.status.stage}` : s.railStatus,
        query: a.status?.query && !s.query ? a.status.query : s.query,
        vlm: a.status?.vlm && !s.vlm ? a.status.vlm : s.vlm,
        tab: a.llm && a.llm.images.length > 0 ? "review" : "ingest",
        ...hydrate(s, a.llm, a.gold),
      }
    case "setTab":
      return { ...s, tab: a.tab }
    case "selectImage":
      return { ...s, current: a.id }
    case "addBox":
      if (!s.gold) return s
      return {
        ...s,
        gold: { ...s.gold, annotations: [...s.gold.annotations, a.ann] },
        editedFrames: new Set(s.editedFrames).add(a.ann.image_id),
        dirty: true,
      }
    case "updateAnn": {
      if (!s.gold) return s
      const imageId = s.gold.annotations.find((x) => x.id === a.id)?.image_id
      if (imageId == null) return s
      return {
        ...s,
        gold: {
          ...s.gold,
          annotations: s.gold.annotations.map((x) =>
            x.id === a.id ? { ...x, bbox: a.bbox, area: a.bbox[2] * a.bbox[3] } : x,
          ),
        },
        editedFrames: new Set(s.editedFrames).add(imageId),
        dirty: true,
      }
    }
    case "deleteAnn":
      if (!s.gold) return s
      return {
        ...s,
        gold: { ...s.gold, annotations: s.gold.annotations.filter((x) => x.id !== a.id) },
        dirty: true,
      }
    case "setMode":
      return { ...s, mode: a.mode }
    case "setClass":
      return { ...s, activeClass: a.name }
    case "saved":
      return { ...s, dirty: false }
    case "results":
      return { ...s, metrics: a.metrics, correctionRate: a.correctionRate }
    case "error":
      return { ...s, error: a.message }
  }
}

function hydrate(s: StudioState, llm: Coco | null, savedGold: Coco | null): Partial<StudioState> {
  if (!llm) {
    return { images: [], categories: [], llm: {}, gold: null, editedFrames: new Set(), current: null }
  }
  const { gold, editedFrames } = mergeCoco(llm, savedGold)
  return {
    images: llm.images,
    categories: llm.categories,
    llm: byImage(llm),
    gold,
    editedFrames: new Set(editedFrames),
    current: llm.images[0]?.id ?? null,
    activeClass: s.activeClass ?? llm.categories[0]?.name ?? null,
  }
}

/* ---------- provider ---------- */

export interface StudioActions {
  boot(): Promise<void>
  openProject(name: string): Promise<void>
  createAndOpen(name: string): Promise<void>
  reloadAnnotations(): Promise<void>
  saveGold(): Promise<void>
  ingestFiles(files: File[]): Promise<{ copied: number; skipped: number }>
  loadResults(): Promise<void>
}

interface StudioContextValue {
  state: StudioState
  actions: StudioActions
  dispatch: React.Dispatch<Action>
}

const StudioContext = createContext<StudioContextValue | null>(null)

declare global {
  interface Window {
    /** Debug/e2e hook: latest studio state + canvas view transform. */
    __SAM_DEBUG__: { state?: StudioState; view?: { scale: number; ox: number; oy: number } }
  }
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  const ref = useRef(state)
  ref.current = state // actions always read the latest state

  const actions = useMemo<StudioActions>(() => {
    async function openProject(name: string): Promise<void> {
      dispatch({ type: "error", message: null })
      let status: StatusT | null = null
      try {
        status = await api.getStatus(name)
      } catch {
        status = null
      }
      const llm = await api.getLlm(name)
      const gold = await api.getGold(name)
      localStorage.setItem("sam.project", name)
      dispatch({ type: "openProject", project: name, status, llm, gold })
      try {
        dispatch({ type: "setProjects", projects: await api.getProjects() })
      } catch {
        /* project list is best-effort */
      }
    }

    return {
      async boot() {
        const fromUrl = new URLSearchParams(window.location.search).get("project")
        const saved = fromUrl ?? localStorage.getItem("sam.project")
        try {
          const projects = await api.getProjects()
          dispatch({ type: "setProjects", projects })
          const name =
            saved && projects.some((p) => p.name === saved)
              ? saved
              : (await api.getStatus(null)).project
          await openProject(name)
        } catch {
          dispatch({ type: "bootDemo" })
        }
      },
      openProject,
      async createAndOpen(name) {
        try {
          const p = await api.createProject(name)
          await openProject(p.name)
        } catch (err) {
          dispatch({ type: "error", message: `create failed: ${(err as Error).message}` })
        }
      },
      async reloadAnnotations() {
        const project = ref.current.project
        if (!project) return
        const llm = await api.getLlm(project)
        const gold = await api.getGold(project)
        dispatch({ type: "openProject", project, status: null, llm, gold })
      },
      async saveGold() {
        const { gold, live, project } = ref.current
        if (!gold) return
        if (live && project) {
          await api.putGold(project, gold)
        }
        dispatch({ type: "saved" })
      },
      async ingestFiles(files) {
        return api.ingest(ref.current.project, files)
      },
      async loadResults() {
        if (!ref.current.live) return
        const project = ref.current.project
        let metrics: MetricsT | null = null
        let correctionRate: string | null = null
        try {
          metrics = await api.getMetrics(project)
        } catch {
          /* no runs with metrics yet */
        }
        try {
          correctionRate = (await api.getCorrections(project)).correction_rate
        } catch {
          /* no gold yet */
        }
        dispatch({ type: "results", metrics, correctionRate })
      },
    }
  }, [])

  const value = useMemo(() => ({ state, actions, dispatch }), [state, actions])
  window.__SAM_DEBUG__ ??= {}
  window.__SAM_DEBUG__.state = state // e2e hook
  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>
}

export function useStudio() {
  const ctx = useContext(StudioContext)
  if (!ctx) throw new Error("useStudio outside StudioProvider")
  return ctx
}

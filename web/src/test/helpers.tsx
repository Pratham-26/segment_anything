/* Test helpers: a fetch mock shaped for lib/api.ts and studio render helpers. */
import { render } from "@testing-library/react"
import type { ReactNode } from "react"
import { useEffect } from "react"
import { vi } from "vitest"
import { StudioProvider, useStudio } from "@/hooks/useStudio"
import type { Coco } from "@/lib/types"

export interface MockReply {
  status?: number
  body?: unknown
}

export function fetchMock(handler: (url: URL, init?: RequestInit) => MockReply | undefined) {
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), "http://localhost")
    const res = handler(url, init) ?? { status: 404, body: null }
    return {
      ok: (res.status ?? 200) < 400,
      status: res.status ?? 200,
      statusText: (res.status ?? 200) < 400 ? "OK" : "Not Found",
      json: async () => res.body,
    }
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

export function deadServer() {
  return fetchMock(() => ({ status: 500, body: null }))
}

/** Dispatches bootDemo once mounted so children see the synthetic dataset. */
function DemoBoot() {
  const { dispatch } = useStudio()
  useEffect(() => {
    dispatch({ type: "bootDemo" })
  }, [dispatch])
  return null
}

/** Mounts children with a live p1 project already open (no fetch). */
function LiveBoot() {
  const { dispatch } = useStudio()
  useEffect(() => {
    dispatch({
      type: "openProject",
      project: "p1",
      status: { project: "p1", stage: "labeled", has_llm: true, vlms: ["m/one", "m/two"] },
      llm: oneImageCoco,
      gold: null,
    })
  }, [dispatch])
  return null
}

export function renderWithStudio(ui: ReactNode, opts?: { demo?: boolean; live?: boolean }) {
  return render(
    <StudioProvider>
      {opts?.demo && <DemoBoot />}
      {opts?.live && <LiveBoot />}
      {ui}
    </StudioProvider>,
  )
}

export const oneImageCoco: Coco = {
  images: [{ id: 1, file_name: "a.png", width: 800, height: 600 }],
  annotations: [
    { id: 1, image_id: 1, category_id: 1, bbox: [10, 10, 50, 50], area: 2500, iscrowd: 0 },
    { id: 2, image_id: 1, category_id: 1, bbox: [200, 100, 80, 40], area: 3200, iscrowd: 0 },
  ],
  categories: [{ id: 1, name: "cat" }],
}

/** Routes for a live project p1 with one image and two llm boxes, no gold. */
export function liveRoutes() {
  return fetchMock((url) => {
    const path = url.pathname
    if (path === "/api/projects") {
      if (url.searchParams.get("project")) return // createProject POST returns below
      return { body: [{ name: "p1", stage: "labeled", images: 1, boxes: 2 }] }
    }
    if (path === "/api/status") {
      return { body: { project: "p1", stage: "labeled", has_llm: true } }
    }
    if (path === "/api/annotations/llm") return { body: oneImageCoco }
    if (path === "/api/annotations/gold") return { status: 404, body: null }
    return { status: 404, body: null }
  })
}

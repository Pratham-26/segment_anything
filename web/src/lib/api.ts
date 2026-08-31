import type { Coco, CorrectionsT, MetricsT, ProjectT, StatusT } from "./types"

/**
 * Thin REST client for the FastAPI server. Every /api path except the project
 * endpoints carries the active project as a query param, matching the server's
 * multi-project scoping.
 */
export function apiPath(path: string, project: string | null): string {
  if (project && path.startsWith("/api/") && !path.startsWith("/api/projects")) {
    path += (path.includes("?") ? "&" : "?") + "project=" + encodeURIComponent(project)
  }
  return path
}

async function api<T>(path: string, project: string | null, opts?: RequestInit): Promise<T> {
  const r = await fetch(apiPath(path, project), opts)
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`)
  return r.json() as Promise<T>
}

function jsonInit(method: string, body: unknown): RequestInit {
  return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
}

export const getProjects = () => api<ProjectT[]>("/api/projects", null)

export const createProject = (name: string) =>
  api<{ name: string }>("/api/projects", null, jsonInit("POST", { name }))

export const getStatus = (project: string | null) => api<StatusT>("/api/status", project)

export const getLlm = (project: string | null) =>
  api<Coco>("/api/annotations/llm", project).catch(() => null)

export const getGold = (project: string | null) =>
  api<Coco>("/api/annotations/gold", project).catch(() => null)

export const putGold = (project: string | null, coco: Coco) =>
  api<Coco>("/api/annotations/gold", project, jsonInit("PUT", coco))

export const imageUrl = (fileName: string, project: string | null) =>
  apiPath(`/api/image/${encodeURIComponent(fileName)}`, project)

export async function ingest(project: string | null, files: File[]): Promise<{ copied: number; skipped: number }> {
  const fd = new FormData()
  for (const f of files) fd.append("files", f)
  return api<{ copied: number; skipped: number }>("/api/ingest", project, { method: "POST", body: fd })
}

export function label(project: string | null, query: string, model: string) {
  return api<{ labeled?: number; failed_images?: string[] }>(
    `/api/label?query=${encodeURIComponent(query)}&model=${encodeURIComponent(model)}`,
    project,
  )
}

export function train(project: string | null, variant: string, epochs: string) {
  return api<{ run: string; train_images: number; val_images: number }>(
    `/api/train?variant=${variant}&epochs=${epochs}`,
    project,
  )
}

export const getMetrics = (project: string | null) => api<MetricsT>("/api/metrics", project)

export const getCorrections = (project: string | null) =>
  api<CorrectionsT>("/api/corrections", project)

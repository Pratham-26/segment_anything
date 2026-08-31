/* Core flow: live server → open project, edit boxes into gold, PUT gold back.
   Every /api call except /api/projects must carry the project scope. */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import App from "@/App"
import { fetchMock, oneImageCoco } from "@/test/helpers"

const user = userEvent.setup()

function dragBox(from: [number, number], to: [number, number]) {
  const canvas = screen.getByTestId("editor-canvas")
  const down = new MouseEvent("pointerdown", {
    bubbles: true,
    clientX: from[0],
    clientY: from[1],
  })
  Object.defineProperty(down, "pointerId", { value: 1 })
  canvas.dispatchEvent(down)
  const move = new MouseEvent("pointermove", {
    bubbles: true,
    clientX: to[0],
    clientY: to[1],
  })
  Object.defineProperty(move, "pointerId", { value: 1 })
  canvas.dispatchEvent(move)
  const up = new MouseEvent("pointerup", { bubbles: true })
  Object.defineProperty(up, "pointerId", { value: 1 })
  canvas.dispatchEvent(up)
}

describe("App live flow", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("opens p1, shows its status, and scopes api calls with ?project=p1", async () => {
    const fetchFn = fetchMock((url, init) => {
      const path = url.pathname
      if (path === "/api/projects") {
        if (url.searchParams.get("project")) return { body: { name: "p1" } }
        return { body: [{ name: "p1", stage: "labeled", images: 1, boxes: 2 }] }
      }
      if (path === "/api/status") {
        return { body: { project: "p1", stage: "labeled", has_llm: true } }
      }
      if (path === "/api/annotations/llm") return { body: oneImageCoco }
      if (path === "/api/annotations/gold") {
        if (init?.method === "PUT") return { body: {} }
        return { status: 404, body: null }
      }
      return { status: 404, body: null }
    })

    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("project: p1 · labeled"),
    )
    expect(screen.getByTestId("review-view")).toBeInTheDocument()
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("a.png")
    // project scoping: every non-projects call carried ?project=p1
    const scoped = fetchFn.mock.calls.filter(
      ([u, init]) =>
        String(u).startsWith("/api/") &&
        !String(u).startsWith("/api/projects") &&
        !(String(u) === "/api/status" && !init),
    )
    expect(scoped.length).toBeGreaterThan(0)
    for (const [u] of scoped) expect(String(u)).toContain("project=p1")
    // unscoped projects listing has no project param
    const listed = fetchFn.mock.calls.filter(([u]) => String(u) === "/api/projects")
    expect(listed.length).toBeGreaterThan(0)
    expect(localStorage.getItem("sam.project")).toBe("p1")
  })

  it("draws a box, saves gold via PUT, and reports success", async () => {
    const fetchFn = fetchMock((url, init) => {
      const path = url.pathname
      if (path === "/api/projects") {
        if (url.searchParams.get("project")) return { body: { name: "p1" } }
        return { body: [{ name: "p1", stage: "labeled", images: 1, boxes: 2 }] }
      }
      if (path === "/api/status") {
        return { body: { project: "p1", stage: "labeled", has_llm: true } }
      }
      if (path === "/api/annotations/llm") return { body: oneImageCoco }
      if (path === "/api/annotations/gold") {
        if (init?.method === "PUT") return { body: {} }
        return { status: 404, body: null }
      }
      return { status: 404, body: null }
    })

    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("project: p1"),
    )

    // draw a new box in fix mode
    await user.click(screen.getByTestId("mode-draw"))
    dragBox([300, 300], [400, 420])
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 3"),
    )

    // save gold → PUT /api/annotations/gold?project=p1 with merged annotations
    await user.click(screen.getByTestId("save-gold"))
    await waitFor(() => expect(screen.getByTestId("save-hint")).toHaveTextContent("Saved"))
    const put = fetchFn.mock.calls.find(
      ([u, init]) => String(u).startsWith("/api/annotations/gold") && init?.method === "PUT",
    )
    expect(put).toBeTruthy()
    const [putUrl, putInit] = put!
    expect(String(putUrl)).toContain("project=p1")
    const body = JSON.parse(String(putInit!.body))
    expect(body.annotations).toHaveLength(3)
    expect(body.annotations.at(-1).bbox).toEqual([300, 300, 100, 120])
    // save cleared the dirty flag
    await waitFor(() => expect(screen.getByTestId("save-gold")).toBeDisabled())
  })

  it("deletes an llm box in gold and PUTs the removal", async () => {
    const fetchFn = fetchMock((url, init) => {
      const path = url.pathname
      if (path === "/api/projects") {
        if (url.searchParams.get("project")) return { body: { name: "p1" } }
        return { body: [{ name: "p1", stage: "labeled", images: 1, boxes: 2 }] }
      }
      if (path === "/api/status") {
        return { body: { project: "p1", stage: "labeled", has_llm: true } }
      }
      if (path === "/api/annotations/llm") return { body: oneImageCoco }
      if (path === "/api/annotations/gold") {
        if (init?.method === "PUT") return { body: {} }
        return { status: 404, body: null }
      }
      return { status: 404, body: null }
    })

    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("project: p1"),
    )
    // browse mode: click inside box 1 [10,10,50,50], then Delete
    dragBox([30, 30], [30, 30])
    const up = new MouseEvent("pointerup", { bubbles: true })
    Object.defineProperty(up, "pointerId", { value: 1 })
    screen.getByTestId("editor-canvas").dispatchEvent(up)
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("● unsaved edits"),
    )
    // select first (topmost reverse scan picks the later ann [200,100,80,40] only if hit; (30,30) hits ann 1)
    dragBox([30, 30], [30, 30])
    fireEventDelete()
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 1"),
    )
    await user.click(screen.getByTestId("save-gold"))
    await waitFor(() => expect(screen.getByTestId("save-hint")).toHaveTextContent("Saved"))
    const put = fetchFn.mock.calls.find(
      ([u, init]) => String(u).startsWith("/api/annotations/gold") && init?.method === "PUT",
    )
    const body = JSON.parse(String(put![1]!.body))
    expect(body.annotations.map((a: { id: number }) => a.id)).not.toContain(1)
  })

  it("results tab fetches metrics and corrections", async () => {
    fetchMock((url, init) => {
      const path = url.pathname
      if (path === "/api/projects") {
        if (url.searchParams.get("project")) return { body: { name: "p1" } }
        return { body: [{ name: "p1", stage: "labeled", images: 1, boxes: 2 }] }
      }
      if (path === "/api/status") {
        return { body: { project: "p1", stage: "labeled", has_llm: true } }
      }
      if (path === "/api/annotations/llm") return { body: oneImageCoco }
      if (path === "/api/annotations/gold") {
        if (init?.method === "PUT") return { body: {} }
        return { status: 404, body: null }
      }
      if (path === "/api/metrics") {
        return {
          body: {
            map50: "0.71",
            map50_95: "0.52",
            per_class: { cat: "0.68" },
          },
        }
      }
      if (path === "/api/corrections") return { body: { correction_rate: "12.5%" } }
      return { status: 404, body: null }
    })

    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("project: p1"),
    )
    await user.click(screen.getByRole("button", { name: "Results" }))
    await waitFor(() =>
      expect(screen.getByTestId("metric-map50")).toHaveTextContent("0.71"),
    )
    expect(screen.getByTestId("metric-map5095")).toHaveTextContent("0.52")
    expect(screen.getByTestId("metric-corr")).toHaveTextContent("12.5%")
    expect(screen.getByTestId("per-class")).toHaveTextContent("cat")
    expect(screen.getByTestId("per-class")).toHaveTextContent("0.68")
    expect(screen.getByTestId("export-row")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Export dataset (COCO zip)" })).toHaveAttribute(
      "href",
      "/api/export?project=p1",
    )
    expect(screen.getByRole("link", { name: "Export train/valid zip" })).toHaveAttribute(
      "href",
      "/api/export?split=true&project=p1",
    )
  })
})

function fireEventDelete() {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true }))
}

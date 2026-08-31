import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ReviewView } from "./ReviewView"
import { renderWithStudio } from "@/test/helpers"

const user = userEvent.setup()

/** Drag a new box on the canvas (image coords == client coords in jsdom). */
function dragBox(from: [number, number], to: [number, number]) {
  const canvas = screen.getByTestId("editor-canvas")
  fireEvent.pointerDown(canvas, { clientX: from[0], clientY: from[1], pointerId: 1 })
  fireEvent.pointerMove(canvas, { clientX: to[0], clientY: to[1], pointerId: 1 })
  fireEvent.pointerUp(canvas, { pointerId: 1 })
}

describe("ReviewView", () => {
  it("shows the empty state when the project has no images", () => {
    renderWithStudio(<ReviewView />)
    expect(screen.getByTestId("review-empty")).toHaveTextContent("Nothing on the table.")
  })

  it("renders the tool tray: modes, class select, stats, filmstrip", () => {
    renderWithStudio(<ReviewView />, { demo: true })
    expect(screen.getByTestId("mode-browse")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("mode-draw")).toBeInTheDocument()
    // demo page_001.png carries 2 llm boxes; gold starts as a copy
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("page_001.png")
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("llm boxes: 2")
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 2")
    expect(screen.getByRole("combobox", { name: "class" })).toBeInTheDocument()
    expect(screen.getByTestId("filmstrip").querySelectorAll("button")).toHaveLength(4)
  })

  it("switches between browse and fix modes", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    await user.click(screen.getByTestId("mode-draw"))
    expect(screen.getByTestId("mode-draw")).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByTestId("mode-browse")).toHaveAttribute("aria-pressed", "false")
  })

  it("draw mode: dragging creates a gold box, marks the frame edited, enables save", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    expect(screen.getByTestId("save-gold")).toBeDisabled()
    await user.click(screen.getByTestId("mode-draw"))
    dragBox([500, 400], [700, 600])
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 3"),
    )
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("● unsaved edits")
    expect(screen.getByTestId("save-gold")).toBeEnabled()
    expect(screen.getByTestId("lamp-1")).toBeInTheDocument() // frame 1 lamp lit
  })

  it("browse mode: clicking a box selects it and Delete removes it", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    // demo ann 1 for page_001.png spans [80,120,193,91] — click inside it
    fireEvent.pointerDown(screen.getByTestId("editor-canvas"), {
      clientX: 100,
      clientY: 140,
      pointerId: 1,
    })
    fireEvent.keyDown(window, { key: "Delete" })
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 1"),
    )
  })

  it("Escape clears the selection; Delete then removes nothing", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    fireEvent.pointerDown(screen.getByTestId("editor-canvas"), {
      clientX: 100,
      clientY: 140,
      pointerId: 1,
    })
    fireEvent.keyDown(window, { key: "Escape" })
    fireEvent.keyDown(window, { key: "Delete" })
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 2"),
    )
  })

  it("b/d shortcuts switch modes", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    fireEvent.keyDown(window, { key: "d" })
    expect(screen.getByTestId("mode-draw")).toHaveAttribute("aria-pressed", "true")
    fireEvent.keyDown(window, { key: "b" })
    expect(screen.getByTestId("mode-browse")).toHaveAttribute("aria-pressed", "true")
  })

  it("moving a box keeps the image clamped and marks edits", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    fireEvent.pointerDown(screen.getByTestId("editor-canvas"), {
      clientX: 100,
      clientY: 140,
      pointerId: 1,
    })
    fireEvent.pointerMove(screen.getByTestId("editor-canvas"), {
      clientX: 160,
      clientY: 190,
      pointerId: 1,
    })
    fireEvent.pointerUp(screen.getByTestId("editor-canvas"), { pointerId: 1 })
    await waitFor(() =>
      expect(screen.getByTestId("frame-stats")).toHaveTextContent("● unsaved edits"),
    )
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("gold boxes: 2")
  })

  it("save in demo mode writes nothing and clears the dirty flag", async () => {
    renderWithStudio(<ReviewView />, { demo: true })
    await user.click(screen.getByTestId("mode-draw"))
    dragBox([500, 400], [700, 600])
    await user.click(screen.getByTestId("save-gold"))
    expect(await screen.findByTestId("save-hint")).toHaveTextContent(
      "Demo mode — nothing written",
    )
    await waitFor(() => expect(screen.getByTestId("save-gold")).toBeDisabled())
  })
})

/* Guard: direct render() would crash without the provider — Documented so the
   next agent keeps using renderWithStudio. */
describe("ReviewView isolation", () => {
  it("requires the studio provider", () => {
    expect(() => render(<ReviewView />)).toThrow(/useStudio outside StudioProvider/)
  })
})

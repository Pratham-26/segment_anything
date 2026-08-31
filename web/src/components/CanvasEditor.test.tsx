import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { CanvasEditor } from "./CanvasEditor"
import { renderWithStudio } from "@/test/helpers"

/* Pointer/keyboard interaction flows are covered in ReviewView.test.tsx, which
   mounts the full tool tray (mode switch + stats readout) around the canvas. */

describe("CanvasEditor", () => {
  it("renders the annotation canvas for the current demo frame", () => {
    renderWithStudio(<CanvasEditor />, { demo: true })
    expect(screen.getByTestId("editor-canvas")).toBeInTheDocument()
    expect(screen.getByLabelText("Annotation canvas")).toBeInTheDocument()
  })
})

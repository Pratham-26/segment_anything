import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { Filmstrip } from "./Filmstrip"
import { renderWithStudio } from "@/test/helpers"

describe("Filmstrip", () => {
  it("renders one thumb per image with its file name", () => {
    renderWithStudio(<Filmstrip />, { demo: true })
    expect(screen.getByLabelText("page_001.png")).toBeInTheDocument()
    expect(screen.getByLabelText("photo_street.jpg")).toBeInTheDocument()
    expect(screen.getByTestId("filmstrip").querySelectorAll("button")).toHaveLength(4)
  })

  it("marks the current frame and follows clicks", async () => {
    const user = userEvent.setup()
    renderWithStudio(<Filmstrip />, { demo: true })
    expect(screen.getByTestId("frame-1")).toHaveClass("border-primary")
    await user.click(screen.getByTestId("frame-2"))
    expect(screen.getByTestId("frame-2")).toHaveClass("border-primary")
    expect(screen.getByTestId("frame-1")).not.toHaveClass("border-primary")
  })

  it("has no lamps before any frame is reviewed into gold", () => {
    renderWithStudio(<Filmstrip />, { demo: true })
    expect(screen.queryByTestId("lamp-1")).not.toBeInTheDocument()
  })
})

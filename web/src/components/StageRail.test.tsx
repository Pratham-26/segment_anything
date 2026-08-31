import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { StageRail } from "./StageRail"
import { renderWithStudio } from "@/test/helpers"

describe("StageRail", () => {
  it("lists the five pipeline stages plus the Projects escape hatch", () => {
    renderWithStudio(<StageRail />, { demo: true })
    for (const name of ["Projects", "Ingest", "Label", "Review", "Train", "Results"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument()
    }
  })

  it("shows the rail status (demo mode)", () => {
    renderWithStudio(<StageRail />, { demo: true })
    expect(screen.getByTestId("rail-status")).toHaveTextContent("demo data — no server attached")
  })

  it("marks the active stage and switches tabs on click", async () => {
    const user = userEvent.setup()
    renderWithStudio(<StageRail />, { demo: true }) // demo boots into review
    expect(screen.getByRole("button", { name: "Review" })).toHaveAttribute(
      "aria-current",
      "page",
    )
    await user.click(screen.getByRole("button", { name: "Train" }))
    expect(screen.getByRole("button", { name: "Train" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Review" })).not.toHaveAttribute("aria-current")
  })
})

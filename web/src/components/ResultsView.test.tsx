import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ResultsView } from "./ResultsView"
import { renderWithStudio } from "@/test/helpers"

describe("ResultsView", () => {
  it("shows placeholder dashes when no metrics exist (demo mode)", () => {
    renderWithStudio(<ResultsView />, { demo: true })
    expect(screen.getByTestId("metric-map50")).toHaveTextContent("—")
    expect(screen.getByTestId("metric-map5095")).toHaveTextContent("—")
    expect(screen.getByTestId("metric-corr")).toHaveTextContent("—")
    expect(screen.getByTestId("per-class")).toHaveTextContent("No per-class AP in this run.")
  })

  it("hides export links in demo mode", () => {
    renderWithStudio(<ResultsView />, { demo: true })
    expect(screen.queryByTestId("export-row")).not.toBeInTheDocument()
  })

  it("live: renders the metrics table and export links", () => {
    renderWithStudio(<ResultsView />, { live: true })
    expect(screen.getByRole("table", { name: "Detector metrics" })).toBeInTheDocument()
    expect(screen.getByTestId("export-row")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Export dataset (COCO zip)" })).toHaveAttribute(
      "href",
      "/api/export?project=p1",
    )
  })
})

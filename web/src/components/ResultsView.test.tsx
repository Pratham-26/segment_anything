import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { ResultsView } from "./ResultsView"
import { fetchMock, renderWithStudio } from "@/test/helpers"

const user = userEvent.setup()

function runsRoutes() {
  return fetchMock((url) => {
    if (url.pathname === "/api/runs") {
      return {
        body: [
          {
            run: "run_b",
            variant: "rf-detr-large",
            epochs: 4,
            status: "done",
            metrics: { map50: "0.83", map50_95: "0.61" },
          },
          {
            run: "run_a",
            variant: "rf-detr-nano",
            epochs: 2,
            status: "done",
            metrics: { map50: "0.71", map50_95: "0.52" },
          },
        ],
      }
    }
    if (url.pathname === "/api/metrics/run_b") {
      return {
        body: { run: "run_b", map50: "0.83", map50_95: "0.61", per_class: { cat: "0.90" } },
      }
    }
    if (url.pathname === "/api/metrics/run_a") {
      return {
        body: { run: "run_a", map50: "0.71", map50_95: "0.52", per_class: { cat: "0.68" } },
      }
    }
    return { status: 404, body: null }
  })
}

describe("ResultsView", () => {
  it("shows placeholder dashes and no runs when not live (demo mode)", () => {
    renderWithStudio(<ResultsView />, { demo: true })
    expect(screen.getByTestId("runs-empty")).toHaveTextContent("No runs yet")
    expect(screen.getByTestId("metric-map50")).toHaveTextContent("—")
    expect(screen.getByTestId("metric-corr")).toHaveTextContent("—")
    expect(screen.queryByTestId("export-row")).not.toBeInTheDocument()
  })

  it("hides export links in demo mode", () => {
    renderWithStudio(<ResultsView />, { demo: true })
    expect(screen.queryByTestId("export-row")).not.toBeInTheDocument()
  })

  it("live: benchmark card scores multiple VLMs on one gold sample", async () => {
    const calls: string[] = []
    fetchMock((url) => {
      if (url.pathname === "/api/benchmark") {
        calls.push(url.search)
        return {
          body: {
            results: [
              { model: "m/one", images: 2, matched: 3, missed: 1, spurious: 0, precision: 1.0, recall: 0.75 },
              { model: "m/two", images: 2, matched: 2, missed: 2, spurious: 1, precision: 0.6667, recall: 0.5 },
            ],
          },
        }
      }
      return { status: 404, body: null }
    })
    renderWithStudio(<ResultsView />, { live: true })
    await waitFor(() =>
      expect(screen.getByTestId("bench-models")).toHaveValue("m/one, m/two"), // defaults from config shortlist
    )
    await user.click(screen.getByTestId("run-benchmark"))
    await waitFor(() => expect(screen.getByTestId("bench-table")).toBeInTheDocument())
    expect(screen.getByTestId("bench-m/one")).toHaveTextContent("m/one")
    expect(screen.getByTestId("bench-m/two")).toHaveTextContent("0.6667")
    expect(calls[0]).toContain("limit=20")
    expect(calls[0]).toContain("model=m%2Fone%2Cm%2Ftwo")
  })

  it("live: lists runs with variant + metrics, defaulting to the first run", async () => {
    runsRoutes()
    renderWithStudio(<ResultsView />, { live: true })
    await waitFor(() => expect(screen.getByTestId("runs-table")).toBeInTheDocument())
    const rows = screen.getAllByTestId(/^run-run_/)
    expect(rows).toHaveLength(2)
    expect(screen.getByTestId("variant-run_b")).toHaveTextContent("rf-detr-large")
    expect(screen.getByTestId("variant-run_a")).toHaveTextContent("rf-detr-nano")
    // detail defaults to the first row (latest run)
    await waitFor(() =>
      expect(screen.getByTestId("metric-map50")).toHaveTextContent("0.83"),
    )
    expect(screen.getByTestId("metric-map5095")).toHaveTextContent("0.61")
    expect(screen.getByTestId("per-class")).toHaveTextContent("cat")
    expect(screen.getByRole("link", { name: "Export dataset (COCO zip)" })).toHaveAttribute(
      "href",
      "/api/export?project=p1",
    )
  })

  it("live: clicking a run loads that run's metrics", async () => {
    runsRoutes()
    renderWithStudio(<ResultsView />, { live: true })
    await waitFor(() => expect(screen.getByTestId("metric-map50")).toHaveTextContent("0.83"))
    await user.click(screen.getByTestId("run-run_a"))
    await waitFor(() => expect(screen.getByTestId("metric-map50")).toHaveTextContent("0.71"))
    expect(screen.getByTestId("metric-map5095")).toHaveTextContent("0.52")
    expect(screen.getByTestId("per-class")).toHaveTextContent("0.68")
  })
})

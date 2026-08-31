/* Core flow: no server attached → synthetic demo data everywhere. */
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"
import App from "@/App"
import { deadServer } from "@/test/helpers"

const user = userEvent.setup()

describe("App demo flow", () => {
  beforeEach(() => {
    localStorage.clear()
    deadServer()
  })

  it("boots into the review light table with synthetic frames and no export links", async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent(
        "demo data — no server attached",
      ),
    )
    // demo boots into review with 4 synthetic frames
    expect(screen.getByTestId("review-view")).toBeInTheDocument()
    expect(screen.getByTestId("filmstrip").querySelectorAll("button")).toHaveLength(4)
    expect(screen.getByTestId("frame-stats")).toHaveTextContent("page_001.png")
  })

  it("projects home explains how to get a live server", async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("demo data"),
    )
    await user.click(screen.getByRole("button", { name: "Projects" }))
    expect(screen.getByTestId("project-list")).toHaveTextContent("sam review")
    expect(screen.getByLabelText("New project")).toBeDisabled()
  })

  it("label stage works offline by echoing the sam command", async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("demo data"),
    )
    await user.click(screen.getByRole("button", { name: "Label" }))
    await user.type(screen.getByLabelText("Query"), "all signatures")
    await user.type(screen.getByLabelText("Vision LLM"), "gemini/gemini-2.0-flash")
    await user.click(screen.getByRole("button", { name: "Label images" }))
    await waitFor(() =>
      expect(screen.getByTestId("label-log")).toHaveTextContent("[demo] sam label"),
    )
  })

  it("switching to results keeps placeholders and hides exports", async () => {
    render(<App />)
    await waitFor(() =>
      expect(screen.getByTestId("rail-status")).toHaveTextContent("demo data"),
    )
    await user.click(screen.getByRole("button", { name: "Results" }))
    await waitFor(() => expect(screen.getByTestId("metric-table")).toBeInTheDocument())
    expect(screen.getByTestId("metric-map50")).toHaveTextContent("—")
    expect(screen.queryByTestId("export-row")).not.toBeInTheDocument()
  })
})

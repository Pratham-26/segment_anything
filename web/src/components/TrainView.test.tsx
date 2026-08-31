import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { TrainView } from "./TrainView"
import { fetchMock, renderWithStudio } from "@/test/helpers"

const user = userEvent.setup()

describe("TrainView", () => {
  it("renders the variant select and epochs input", () => {
    renderWithStudio(<TrainView />, { demo: true })
    expect(screen.getByRole("combobox", { name: "RF-DETR variant" })).toHaveTextContent(
      "rf-detr-base",
    )
    expect(screen.getByLabelText("Epochs")).toHaveValue(100)
  })

  it("in demo mode logs the would-be run", async () => {
    const fetchFn = vi.fn()
    vi.stubGlobal("fetch", fetchFn)
    renderWithStudio(<TrainView />, { demo: true })
    await user.clear(screen.getByLabelText("Epochs"))
    await user.type(screen.getByLabelText("Epochs"), "50")
    await user.click(screen.getByRole("button", { name: "Start run" }))
    await waitFor(() =>
      expect(screen.getByTestId("run-list")).toHaveTextContent("[demo] variant=rf-detr-base"),
    )
    expect(screen.getByTestId("run-list")).toHaveTextContent("epochs=50")
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("lets the user pick another RF-DETR variant", async () => {
    renderWithStudio(<TrainView />, { demo: true })
    await user.click(screen.getByRole("combobox", { name: "RF-DETR variant" }))
    await user.click(await screen.findByRole("option", { name: "rf-detr-nano" }))
    expect(screen.getByRole("combobox", { name: "RF-DETR variant" })).toHaveTextContent(
      "rf-detr-nano",
    )
  })

  it("live: calls /api/train with variant, epochs, and project scope", async () => {
    const calls: string[] = []
    fetchMock((url) => {
      calls.push(url.pathname + url.search)
      if (url.pathname === "/api/train") {
        return { body: { run: "run_001", train_images: 9, val_images: 1 } }
      }
      return { status: 404, body: null }
    })
    renderWithStudio(<TrainView />, { live: true })
    await user.click(screen.getByRole("button", { name: "Start run" }))
    await waitFor(() =>
      expect(screen.getByTestId("run-list")).toHaveTextContent("done: run=run_001"),
    )
    expect(screen.getByTestId("run-list")).toHaveTextContent("train=9 val=1")
    const trainCall = calls.find((c) => c.startsWith("/api/train?"))!
    expect(trainCall).toContain("variant=rf-detr-base")
    expect(trainCall).toContain("epochs=100")
    expect(trainCall).toContain("project=p1")
  })
})

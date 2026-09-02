import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { LabelView } from "./LabelView"
import { fetchMock, renderWithStudio } from "@/test/helpers"

const user = userEvent.setup()

describe("LabelView", () => {
  it("renders query and vlm fields", () => {
    renderWithStudio(<LabelView />, { demo: true })
    expect(screen.getByLabelText("Query")).toBeInTheDocument()
    expect(screen.getByLabelText("Vision LLM")).toBeInTheDocument()
  })

  it("offers a picker of configured VLMs and fills the input from it", async () => {
    renderWithStudio(<LabelView />, { live: true })
    const picker = screen.getByTestId("vlm-picker")
    await user.click(picker)
    await user.click(await screen.findByRole("option", { name: "m/two" }))
    expect(screen.getByLabelText("Vision LLM")).toHaveValue("m/two")
    // free-text still wins once typed
    await user.type(screen.getByLabelText("Vision LLM"), "!")
    expect(screen.getByLabelText("Vision LLM")).toHaveValue("m/two!")
  })

  it("demo mode also offers the picker (demo shortlist)", () => {
    renderWithStudio(<LabelView />, { demo: true })
    expect(screen.queryByTestId("vlm-picker")).toBeInTheDocument()
  })

  it("in demo mode logs the equivalent sam label command", async () => {
    const fetchFn = vi.fn()
    vi.stubGlobal("fetch", fetchFn)
    renderWithStudio(<LabelView />, { demo: true })
    await user.type(screen.getByLabelText("Query"), "all signatures")
    await user.type(screen.getByLabelText("Vision LLM"), "gemini/gemini-2.0-flash")
    await user.click(screen.getByRole("button", { name: "Label images" }))
    await waitFor(() =>
      expect(screen.getByTestId("label-log")).toHaveTextContent(
        '[demo] sam label --query "all signatures" --vlm "gemini/gemini-2.0-flash"',
      ),
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("live: calls /api/label with query, model, and project scope", async () => {
    const calls: string[] = []
    fetchMock((url) => {
      calls.push(url.pathname + url.search)
      if (url.pathname === "/api/label") {
        return { body: { labeled: 3, failed_images: ["z.png"] } }
      }
      if (url.pathname === "/api/annotations/llm") {
        return {
          body: {
            images: [{ id: 1, file_name: "a.png", width: 800, height: 600 }],
            annotations: [],
            categories: [{ id: 1, name: "cat" }],
          },
        }
      }
      if (url.pathname === "/api/annotations/gold") return { status: 404, body: null }
      return { status: 404, body: null }
    })
    renderWithStudio(<LabelView />, { live: true })
    await user.type(screen.getByLabelText("Query"), "all dates")
    await user.type(screen.getByLabelText("Vision LLM"), "openai/gpt-4o")
    await user.click(screen.getByRole("button", { name: "Label images" }))
    await waitFor(() =>
      expect(screen.getByTestId("label-log")).toHaveTextContent("labeled 3, 1 failed"),
    )
    expect(calls.some((c) => c.startsWith("/api/label?"))).toBe(true)
    const labelCall = calls.find((c) => c.startsWith("/api/label?"))!
    expect(labelCall).toContain("query=all%20dates")
    expect(labelCall).toContain("model=openai%2Fgpt-4o")
    expect(labelCall).toContain("project=p1")
  })
})

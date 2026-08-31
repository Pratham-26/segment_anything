import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { IngestView } from "./IngestView"
import { fetchMock, renderWithStudio } from "@/test/helpers"

function pngFile(name: string) {
  return new File(["x"], name, { type: "image/png" })
}

describe("IngestView", () => {
  it("renders the dropzone", () => {
    renderWithStudio(<IngestView />, { demo: true })
    expect(screen.getByRole("button", { name: "Upload files" })).toBeInTheDocument()
  })

  it("accepts images and PDFs, multiple files", () => {
    renderWithStudio(<IngestView />, { demo: true })
    const input = screen.getByTestId("file-input") as HTMLInputElement
    expect(input.accept).toBe("image/*,.pdf")
    expect(input.multiple).toBe(true)
  })

  it("in demo mode logs that ingest needs the server and never calls fetch", async () => {
    const fetchFn = vi.fn()
    vi.stubGlobal("fetch", fetchFn)
    renderWithStudio(<IngestView />, { demo: true })
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [pngFile("a.png")] },
    })
    await waitFor(() =>
      expect(screen.getByTestId("ingest-log")).toHaveTextContent(
        "[demo] ingest needs the server — 1 file(s) ignored",
      ),
    )
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it("live: uploads files, logs the result, and reloaded annotations arrive", async () => {
    const fetchFn = fetchMock((url) => {
      if (url.pathname === "/api/ingest") {
        expect(url.searchParams.get("project")).toBe("p1")
        return { body: { copied: 2, skipped: 1 } }
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
    renderWithStudio(<IngestView />, { live: true })
    fireEvent.change(screen.getByTestId("file-input"), {
      target: { files: [pngFile("a.png"), pngFile("b.pdf")] },
    })
    await waitFor(() => expect(fetchFn).toHaveBeenCalled())
    await waitFor(() =>
      expect(screen.getByTestId("ingest-log")).toHaveTextContent("copied 2, skipped 1"),
    )
    expect(screen.getByTestId("ingest-log")).toHaveTextContent("uploading 2 file(s)…")
  })
})

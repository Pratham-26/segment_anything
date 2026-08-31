import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Button } from "./button"

describe("Button (shadcn)", () => {
  it("renders a button and handles clicks", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save gold</Button>)
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: "Save gold" }))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("supports variants, sizes, and disabled state", () => {
    render(
      <Button variant="outline" size="sm" disabled>
        Locked
      </Button>,
    )
    expect(screen.getByRole("button", { name: "Locked" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Locked" }).dataset.variant).toBe("outline")
  })

  it("renders as a child element with asChild", () => {
    render(
      <Button asChild>
        <a href="/api/export" download>
          Export
        </a>
      </Button>,
    )
    expect(screen.getByRole("link", { name: "Export" })).toHaveAttribute("href", "/api/export")
  })
})

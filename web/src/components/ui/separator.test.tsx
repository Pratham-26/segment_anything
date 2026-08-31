import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Separator } from "./separator"

describe("Separator (shadcn)", () => {
  it("renders with the separator data slot and orientation", () => {
    const { container } = render(<Separator orientation="vertical" />)
    const el = container.querySelector('[data-slot="separator"]')
    expect(el).toBeInTheDocument()
    expect(el).toHaveAttribute("data-orientation", "vertical")
  })
})

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Badge } from "./badge"

describe("Badge (shadcn)", () => {
  it("renders text and supports variants", () => {
    render(
      <>
        <Badge>labeled</Badge>
        <Badge variant="outline">gold</Badge>
      </>,
    )
    expect(screen.getByText("labeled")).toBeInTheDocument()
    expect(screen.getByText("gold").dataset.variant).toBe("outline")
  })
})

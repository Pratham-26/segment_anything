import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ScrollArea } from "./scroll-area"

describe("ScrollArea (shadcn)", () => {
  it("renders its children inside the viewport", () => {
    render(
      <ScrollArea data-testid="strip">
        <div>frame-001</div>
      </ScrollArea>,
    )
    expect(screen.getByTestId("strip")).toBeInTheDocument()
    expect(screen.getByText("frame-001")).toBeInTheDocument()
  })
})

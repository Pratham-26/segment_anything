import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Input } from "./input"
import { Label } from "./label"

describe("Label (shadcn)", () => {
  it("associates with a control via htmlFor", () => {
    render(
      <>
        <Label htmlFor="q">Query</Label>
        <Input id="q" />
      </>,
    )
    expect(screen.getByLabelText("Query")).toBeInTheDocument()
  })
})

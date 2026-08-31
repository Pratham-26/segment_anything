import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { Input } from "./input"

describe("Input (shadcn)", () => {
  it("accepts typed text and reports changes", async () => {
    const onChange = vi.fn()
    render(<Input aria-label="Query" onChange={onChange} />)
    const user = userEvent.setup()
    await user.type(screen.getByLabelText("Query"), "all signatures")
    expect(screen.getByLabelText("Query")).toHaveValue("all signatures")
    expect(onChange).toHaveBeenCalledTimes(14)
  })

  it("can be disabled", () => {
    render(<Input disabled placeholder="e.g. contracts-2024" />)
    expect(screen.getByPlaceholderText("e.g. contracts-2024")).toBeDisabled()
  })
})

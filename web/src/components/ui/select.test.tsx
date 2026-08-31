import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./select"

describe("Select (shadcn, Radix)", () => {
  it("opens, lists options, and selects a value", async () => {
    const onValueChange = vi.fn()
    render(
      <Select onValueChange={onValueChange}>
        <SelectTrigger aria-label="RF-DETR variant">
          <SelectValue placeholder="pick a variant" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rf-detr-base">rf-detr-base</SelectItem>
          <SelectItem value="rf-detr-nano">rf-detr-nano</SelectItem>
        </SelectContent>
      </Select>,
    )
    const user = userEvent.setup()
    await user.click(screen.getByRole("combobox", { name: "RF-DETR variant" }))
    const opt = await screen.findByRole("option", { name: "rf-detr-nano" })
    await user.click(opt)
    expect(onValueChange).toHaveBeenCalledWith("rf-detr-nano")
  })

  it("shows the current value", () => {
    render(
      <Select value="rf-detr-base">
        <SelectTrigger aria-label="RF-DETR variant">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="rf-detr-base">rf-detr-base</SelectItem>
        </SelectContent>
      </Select>,
    )
    expect(screen.getByRole("combobox", { name: "RF-DETR variant" })).toHaveTextContent(
      "rf-detr-base",
    )
  })
})

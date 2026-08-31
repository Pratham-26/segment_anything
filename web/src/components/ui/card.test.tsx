import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card"

describe("Card (shadcn)", () => {
  it("renders header, title, description, and content slots", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Light table</CardTitle>
          <CardDescription>Inspect each frame</CardDescription>
        </CardHeader>
        <CardContent>body text</CardContent>
      </Card>,
    )
    expect(screen.getByText("Light table")).toBeInTheDocument()
    expect(screen.getByText("Inspect each frame")).toBeInTheDocument()
    expect(screen.getByText("body text")).toBeInTheDocument()
  })
})

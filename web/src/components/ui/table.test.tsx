import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table"

describe("Table (shadcn)", () => {
  it("renders a header row and data rows", () => {
    render(
      <Table aria-label="Detector metrics">
        <TableHeader>
          <TableRow>
            <TableHead>metric</TableHead>
            <TableHead>value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>mAP@50</TableCell>
            <TableCell>0.71</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    )
    expect(screen.getByRole("table", { name: "Detector metrics" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "metric" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "mAP@50" })).toBeInTheDocument()
    expect(screen.getByRole("cell", { name: "0.71" })).toBeInTheDocument()
  })
})

import { screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { ProjectsHome } from "./ProjectsHome"
import { renderWithStudio } from "@/test/helpers"

describe("ProjectsHome", () => {
  it("in demo mode disables the form and explains that the server manages projects", () => {
    renderWithStudio(<ProjectsHome />, { demo: true })
    expect(screen.getByLabelText("New project")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Create project" })).toBeDisabled()
    expect(screen.getByTestId("project-list")).toHaveTextContent("sam review")
  })

  it("without a server boot the list explains how to start one", () => {
    renderWithStudio(<ProjectsHome />)
    expect(screen.getByTestId("project-list")).toHaveTextContent("sam review")
  })
})

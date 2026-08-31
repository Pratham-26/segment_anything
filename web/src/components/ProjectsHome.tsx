import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useStudio } from "@/hooks/useStudio"

export function ProjectsHome() {
  const { state, actions, dispatch } = useStudio()
  const [name, setName] = useState("")

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state.live || !name.trim()) return
    void actions.createAndOpen(name.trim())
    setName("")
  }

  function open(name: string) {
    actions.openProject(name).catch((err: Error) =>
      dispatch({ type: "error", message: `open failed: ${err.message}` }),
    )
  }

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl p-6">
        <header>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A project is one folder on disk: its images, its labels, its runs. Open one to work on
            it. Every stage above acts on the open project.
          </p>
        </header>

        <form
          data-testid="new-project-form"
          className="mt-4 flex items-end gap-2"
          onSubmit={onSubmit}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="new-project-name">New project</Label>
            <Input
              id="new-project-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. contracts-2024"
              disabled={!state.live}
              required
            />
          </div>
          <Button type="submit" disabled={!state.live}>
            Create project
          </Button>
        </form>

        {state.error && (
          <p role="alert" className="mt-2 text-sm text-destructive" data-testid="home-error">
            {state.error}
          </p>
        )}

        <div data-testid="project-list" aria-live="polite" className="mt-6 space-y-2">
          {!state.live ? (
            <p className="text-sm text-muted-foreground">
              Projects are managed by the server — start it with{" "}
              <code className="font-mono">sam review</code> to list, open, and create projects
              here.
            </p>
          ) : state.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects yet — create one above.</p>
          ) : (
            state.projects.map((p) => (
              <Button
                key={p.name}
                variant="outline"
                data-testid={`project-${p.name}`}
                className="h-auto w-full justify-between px-4 py-3"
                onClick={() => open(p.name)}
              >
                <span className="flex min-w-0 items-center gap-3">
                  <span className="truncate font-medium text-foreground">{p.name}</span>
                  <Badge variant="secondary">{p.stage}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    {p.images} img · {p.boxes} boxes
                  </span>
                  {p.gold && <Badge variant="outline">gold</Badge>}
                  {p.metrics && <Badge variant="outline">metrics</Badge>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.name === state.project ? "open now" : "Open →"}
                </span>
              </Button>
            ))
          )}
        </div>
      </div>
    </section>
  )
}

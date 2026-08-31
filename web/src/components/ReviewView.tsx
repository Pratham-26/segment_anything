import { useState } from "react"
import { CanvasEditor } from "@/components/CanvasEditor"
import { Filmstrip } from "@/components/Filmstrip"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { useStudio } from "@/hooks/useStudio"
import { cn } from "@/lib/utils"

export function ReviewView() {
  const { state, dispatch, actions } = useStudio()
  const [hint, setHint] = useState("")

  if (state.images.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center p-8"
        data-testid="review-empty"
      >
        <Card className="max-w-md text-center">
          <CardHeader>
            <CardTitle>Nothing on the table.</CardTitle>
            <CardDescription>
              Ingest images, then run a labeling query to see frames here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-xs text-muted-foreground">
              sam ingest … && sam label --query "…"
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const current = state.images.find((i) => i.id === state.current)
  const llmCount = state.current != null ? (state.llm[state.current]?.length ?? 0) : 0
  const goldCount =
    state.current != null
      ? (state.gold?.annotations.filter((a) => a.image_id === state.current).length ?? 0)
      : 0
  const edited = state.current != null && state.editedFrames.has(state.current)

  async function onSave() {
    try {
      await actions.saveGold()
      setHint(state.live ? "Saved to annotations/gold.coco.json" : "Demo mode — nothing written")
      window.setTimeout(() => setHint(""), 4000)
    } catch (err) {
      setHint(`Save failed: ${(err as Error).message}`)
    }
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col" data-testid="review-view">
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 shrink-0 flex-col gap-3 overflow-y-auto border-r p-3">
          <h1 className="text-lg font-semibold">Light table</h1>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">mode</Label>
            <div className="flex gap-1" role="group" aria-label="Edit mode">
              <Button
                size="sm"
                variant={state.mode === "browse" ? "default" : "outline"}
                aria-pressed={state.mode === "browse"}
                title="Browse (B)"
                data-testid="mode-browse"
                onClick={() => dispatch({ type: "setMode", mode: "browse" })}
              >
                Browse
              </Button>
              <Button
                size="sm"
                variant={state.mode === "draw" ? "default" : "outline"}
                aria-pressed={state.mode === "draw"}
                title="Draw boxes (D)"
                data-testid="mode-draw"
                onClick={() => dispatch({ type: "setMode", mode: "draw" })}
              >
                Fix
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="class-select" className="text-xs text-muted-foreground">
              class
            </Label>
            <Select
              value={state.activeClass ?? undefined}
              onValueChange={(v) => dispatch({ type: "setClass", name: v })}
            >
              <SelectTrigger id="class-select" className="w-full" data-testid="class-select">
                <SelectValue placeholder="class" />
              </SelectTrigger>
              <SelectContent>
                {state.categories.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">subset</Label>
            <div className="flex items-center gap-2 text-sm">
              <span aria-hidden className="size-2.5 rounded-full bg-primary/50" />
              <span>llm</span>
              <span aria-hidden className="ml-2 size-2.5 rounded-full bg-primary" />
              <span>gold</span>
            </div>
          </div>

          <Separator />

          <pre
            data-testid="frame-stats"
            className="font-mono text-xs whitespace-pre-wrap text-muted-foreground"
          >
            {`${current?.file_name ?? "—"}\nllm boxes: ${llmCount}\ngold boxes: ${goldCount}${edited ? "\n● unsaved edits" : ""}`}
          </pre>

          <div className="mt-auto space-y-1.5">
            <Button
              className="w-full"
              disabled={!state.dirty}
              data-testid="save-gold"
              onClick={() => void onSave()}
            >
              Save gold
            </Button>
            <p
              data-testid="save-hint"
              className={cn("min-h-4 text-xs text-muted-foreground")}
            >
              {hint}
            </p>
          </div>
        </aside>

        <CanvasEditor />
      </div>

      <Filmstrip />
    </main>
  )
}

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useStudio } from "@/hooks/useStudio"
import * as api from "@/lib/api"

export function LabelView() {
  const { state, actions } = useStudio()
  const [typedQuery, setTypedQuery] = useState("")
  const [typedVlm, setTypedVlm] = useState("")
  const [logs, setLogs] = useState<string[]>([])

  // Server-provided defaults fill the fields until the user types.
  const query = typedQuery || state.query
  const vlm = typedVlm || state.vlm

  function addLog(text: string) {
    setLogs((ls) => [...ls, text])
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query || !vlm) return
    if (!state.live) {
      addLog(`[demo] sam label --query "${query}" --vlm "${vlm}"`)
      return
    }
    addLog(`labeling with ${vlm}… (one VLM call per image; slow)`)
    try {
      const r = await api.label(state.project, query, vlm)
      addLog(
        `labeled ${r.labeled ?? "?"}${r.failed_images?.length ? `, ${r.failed_images.length} failed` : ""}`,
      )
      await actions.reloadAnnotations()
    } catch (err) {
      addLog(`label failed: ${(err as Error).message}`)
    }
  }

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Label</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            A vision LLM boxes everything your query asks for. Model choice is yours: any LiteLLM id
            works. Responses are cached; failures are logged, never fatal.
          </p>
        </header>

        <form
          data-testid="label-form"
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="query-input">Query</Label>
            <Input
              id="query-input"
              data-testid="query-input"
              value={query}
              onChange={(e) => setTypedQuery(e.target.value)}
              placeholder='e.g. "all signatures and all dates"'
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="vlm-input">Vision LLM</Label>
            <Input
              id="vlm-input"
              data-testid="vlm-input"
              value={vlm}
              onChange={(e) => setTypedVlm(e.target.value)}
              placeholder="gemini/gemini-2.0-flash"
              required
            />
            {state.vlms.length > 0 && (
              <Select value="" onValueChange={(v) => setTypedVlm(v)}>
                <SelectTrigger data-testid="vlm-picker" aria-label="Pick a configured VLM">
                  <SelectValue placeholder="pick a configured model…" />
                </SelectTrigger>
                <SelectContent>
                  {state.vlms.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <Button type="submit">Label images</Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              data-testid="label-log"
              aria-live="polite"
              className="min-h-12 font-mono text-xs whitespace-pre-wrap text-muted-foreground"
            >
              {logs.length ? logs.join("\n") + "\n" : ""}
            </pre>
          </CardContent>
        </Card>
      </div>
    </section>
  )
}

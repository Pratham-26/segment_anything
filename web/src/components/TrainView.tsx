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

const VARIANTS = ["rf-detr-base", "rf-detr-large", "rf-detr-nano"]

export function TrainView() {
  const { state } = useStudio()
  const [variant, setVariant] = useState("rf-detr-base")
  const [epochs, setEpochs] = useState("100")
  const [logs, setLogs] = useState<string[]>([])

  function addLog(text: string) {
    setLogs((ls) => [...ls, text])
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state.live) {
      addLog(`[demo] variant=${variant} epochs=${epochs}`)
      return
    }
    addLog("training started — split runs automatically (10% val, gold forced into val)")
    try {
      const r = await api.train(state.project, variant, epochs)
      addLog(`done: run=${r.run} train=${r.train_images} val=${r.val_images}`)
    } catch (err) {
      addLog(`train failed: ${(err as Error).message}`)
    }
  }

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Train</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Validation is 10% of the dataset, seeded; every gold image is forced into validation and
            never trained on.
          </p>
        </header>

        <form
          data-testid="train-form"
          className="grid gap-3 sm:grid-cols-[1fr_120px_auto] sm:items-end"
          onSubmit={(e) => void onSubmit(e)}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="variant-select">RF-DETR variant</Label>
            <Select value={variant} onValueChange={setVariant}>
              <SelectTrigger id="variant-select" className="w-full" data-testid="variant-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VARIANTS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="epochs-input">Epochs</Label>
            <Input
              id="epochs-input"
              data-testid="epochs-input"
              type="number"
              min={1}
              value={epochs}
              onChange={(e) => setEpochs(e.target.value)}
            />
          </div>
          <Button type="submit">Start run</Button>
        </form>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              data-testid="run-list"
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

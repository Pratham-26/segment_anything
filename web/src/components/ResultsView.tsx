import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStudio } from "@/hooks/useStudio"
import * as api from "@/lib/api"
import { apiPath } from "@/lib/api"
import type { BenchT, MetricsT, RunT } from "@/lib/types"
import { cn } from "@/lib/utils"

const MAX_BENCH_LIMIT = 20

export function ResultsView() {
  const { state } = useStudio()
  const [runs, setRuns] = useState<RunT[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [detail, setDetail] = useState<(MetricsT & { run: string }) | null>(null)
  const [error, setError] = useState<string | null>(null)

  // VLM benchmark form: defaults to the project's configured shortlist.
  const [benchModels, setBenchModels] = useState("")
  const [benchLimit, setBenchLimit] = useState(String(MAX_BENCH_LIMIT))
  const [bench, setBench] = useState<BenchT[] | null>(null)
  const [benchBusy, setBenchBusy] = useState(false)

  useEffect(() => {
    if (state.vlms.length && !benchModels) {
      setBenchModels(state.vlms.join(", "))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.vlms])

  useEffect(() => {
    if (!state.live) return
    let cancelled = false
    api
      .getRuns(state.project)
      .then((rs) => {
        if (cancelled) return
        setRuns(rs)
        // latest run first (server sorts desc) is the sensible default selection
        const first = rs.find((r) => r.metrics)?.run ?? rs[0]?.run ?? null
        if (first) void selectRun(first, rs)
      })
      .catch(() => setError("could not load runs"))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.live, state.project])

  async function selectRun(run: string, from?: RunT[]) {
    setSelected(run)
    setDetail(null)
    try {
      const m = await api.getRunMetrics(state.project, run)
      setDetail(m)
    } catch {
      // run has no metrics yet (still training or not evaluated)
      setError(`no metrics for ${run} yet`)
    }
    void from
  }

  async function runBenchmark() {
    const models = benchModels.split(",").map((m) => m.trim()).filter(Boolean)
    if (!models.length) {
      setError("give at least one VLM id to benchmark")
      return
    }
    const limit = Math.max(1, Math.min(MAX_BENCH_LIMIT, parseInt(benchLimit, 10) || MAX_BENCH_LIMIT))
    setBenchBusy(true)
    setError(null)
    try {
      setBench(await api.getBenchmark(state.project, models, limit))
    } catch (err) {
      setError(`benchmark failed: ${(err as Error).message}`)
    } finally {
      setBenchBusy(false)
    }
  }

  const perClass = Object.entries(detail?.per_class ?? ({} as Record<string, string>))

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Results</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detector metrics score against the gold-anchored validation set. The correction rate
            scores the VLM. Compare runs across RF-DETR variants here.
          </p>
        </header>

        {error && (
          <p role="alert" className="text-sm text-destructive" data-testid="results-error">
            {error}
          </p>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Runs</CardTitle>
            <CardDescription>One row per training run; click to inspect.</CardDescription>
          </CardHeader>
          <CardContent>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="runs-empty">
                No runs yet — start one in the Train tab.
              </p>
            ) : (
              <Table data-testid="runs-table" aria-label="Detector runs">
                <TableHeader>
                  <TableRow>
                    <TableHead>run</TableHead>
                    <TableHead>variant</TableHead>
                    <TableHead className="text-right">epochs</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead className="text-right">mAP@50</TableHead>
                    <TableHead className="text-right">mAP@50:95</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow
                      key={r.run}
                      data-testid={`run-${r.run}`}
                      aria-selected={selected === r.run}
                      className={cn(
                        "cursor-pointer",
                        selected === r.run && "bg-accent",
                      )}
                      onClick={() => void selectRun(r.run)}
                    >
                      <TableCell className="font-mono">{r.run}</TableCell>
                      <TableCell data-testid={`variant-${r.run}`}>{r.variant ?? "—"}</TableCell>
                      <TableCell className="text-right font-mono">{r.epochs ?? "—"}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell className="text-right font-mono">
                        {r.metrics?.map50 ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {r.metrics?.map50_95 ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">
                Detector metrics{selected ? ` — ${selected}` : ""}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table data-testid="metric-table" aria-label="Detector metrics">
                <TableHeader>
                  <TableRow>
                    <TableHead>metric</TableHead>
                    <TableHead className="text-right">value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell>mAP@50</TableCell>
                    <TableCell data-testid="metric-map50" className="text-right font-mono">
                      {detail?.map50 ?? "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>mAP@50:95</TableCell>
                    <TableCell data-testid="metric-map5095" className="text-right font-mono">
                      {detail?.map50_95 ?? "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>correction rate</TableCell>
                    <TableCell data-testid="metric-corr" className="text-right font-mono">
                      {state.correctionRate ?? "—"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Per-class AP</CardTitle>
              <CardDescription>Appears after the first evaluation.</CardDescription>
            </CardHeader>
            <CardContent data-testid="per-class">
              {perClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">No per-class AP in this run.</p>
              ) : (
                perClass.map(([k, v]) => (
                  <div key={k} className="flex justify-between font-mono text-sm">
                    <span>{k}</span>
                    <span>{v}</span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">VLM benchmark</CardTitle>
              <CardDescription>
                Score VLMs against the same gold sample (≤{MAX_BENCH_LIMIT} images); precision/recall
                compare them directly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_90px_auto] sm:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor="bench-models">VLMs (comma-separated LiteLLM ids)</Label>
                  <Input
                    id="bench-models"
                    data-testid="bench-models"
                    value={benchModels}
                    onChange={(e) => setBenchModels(e.target.value)}
                    placeholder="gemini/gemini-2.0-flash, openai/gpt-4o-mini"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="bench-limit">Images</Label>
                  <Input
                    id="bench-limit"
                    data-testid="bench-limit"
                    type="number"
                    min={1}
                    max={MAX_BENCH_LIMIT}
                    value={benchLimit}
                    onChange={(e) => setBenchLimit(e.target.value)}
                  />
                </div>
                <Button
                  data-testid="run-benchmark"
                  disabled={benchBusy || !state.live}
                  onClick={() => void runBenchmark()}
                >
                  {benchBusy ? "Scoring…" : "Run benchmark"}
                </Button>
              </div>
              {bench && bench.length > 0 && (
                <Table data-testid="bench-table" aria-label="VLM benchmark">
                  <TableHeader>
                    <TableRow>
                      <TableHead>model</TableHead>
                      <TableHead className="text-right">matched</TableHead>
                      <TableHead className="text-right">missed</TableHead>
                      <TableHead className="text-right">spurious</TableHead>
                      <TableHead className="text-right">precision</TableHead>
                      <TableHead className="text-right">recall</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bench.map((b) => (
                      <TableRow key={b.model} data-testid={`bench-${b.model}`}>
                        <TableCell className="max-w-48 truncate font-mono" title={b.model}>
                          {b.model}
                        </TableCell>
                        <TableCell className="text-right font-mono">{b.matched}</TableCell>
                        <TableCell className="text-right font-mono">{b.missed}</TableCell>
                        <TableCell className="text-right font-mono">{b.spurious}</TableCell>
                        <TableCell className="text-right font-mono">{b.precision ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{b.recall ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        {state.live && (
          <div className="flex gap-2" data-testid="export-row">
            <Button asChild variant="outline">
              <a href={apiPath("/api/export", state.project)} download>
                Export dataset (COCO zip)
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={apiPath("/api/export?split=true", state.project)} download>
                Export train/valid zip
              </a>
            </Button>
          </div>
        )}
      </div>
    </section>
  )
}

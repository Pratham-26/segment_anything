import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStudio } from "@/hooks/useStudio"
import { apiPath } from "@/lib/api"

export function ResultsView() {
  const { state } = useStudio()
  const m = state.metrics
  const perClass = Object.entries(m?.per_class ?? ({} as Record<string, string>))

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Results</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Detector metrics score against the gold-anchored validation set. The correction rate
            scores the VLM.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Detector metrics</CardTitle>
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
                      {m?.map50 ?? "—"}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell>mAP@50:95</TableCell>
                    <TableCell data-testid="metric-map5095" className="text-right font-mono">
                      {m?.map50_95 ?? "—"}
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

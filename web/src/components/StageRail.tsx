import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useStudio } from "@/hooks/useStudio"
import type { Tab } from "@/lib/types"
import { cn } from "@/lib/utils"

const STAGES: Array<{ tab: Tab; step?: string; label: string }> = [
  { tab: "projects", label: "Projects" },
  { tab: "ingest", step: "1", label: "Ingest" },
  { tab: "label", step: "2", label: "Label" },
  { tab: "review", step: "3", label: "Review" },
  { tab: "train", step: "4", label: "Train" },
  { tab: "results", step: "5", label: "Results" },
]

export function StageRail() {
  const { state, dispatch } = useStudio()
  return (
    <nav
      aria-label="Pipeline stages"
      data-testid="stage-rail"
      className="flex shrink-0 items-center gap-1 border-b bg-background px-3 py-2"
    >
      {STAGES.map((s, i) => (
        <span key={s.tab} className="flex items-center gap-1">
          {i === 1 && <Separator orientation="vertical" className="mx-1 h-5" />}
          <Button
            variant={state.tab === s.tab ? "secondary" : "ghost"}
            size="sm"
            aria-current={state.tab === s.tab ? "page" : undefined}
            onClick={() => dispatch({ type: "setTab", tab: s.tab })}
          >
            {s.step && (
              <span aria-hidden className="font-mono text-xs text-muted-foreground">
                {s.step}
              </span>
            )}
            {s.label}
          </Button>
        </span>
      ))}
      <span
        data-testid="rail-status"
        className={cn("ml-auto font-mono text-xs text-muted-foreground")}
      >
        {state.railStatus}
      </span>
    </nav>
  )
}

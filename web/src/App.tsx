import { useEffect } from "react"
import { IngestView } from "@/components/IngestView"
import { LabelView } from "@/components/LabelView"
import { ProjectsHome } from "@/components/ProjectsHome"
import { ResultsView } from "@/components/ResultsView"
import { ReviewView } from "@/components/ReviewView"
import { StageRail } from "@/components/StageRail"
import { TrainView } from "@/components/TrainView"
import { StudioProvider, useStudio } from "@/hooks/useStudio"

export default function App() {
  return (
    <StudioProvider>
      <Shell />
    </StudioProvider>
  )
}

function Shell() {
  const { state, actions } = useStudio()

  useEffect(() => {
    void actions.boot()
  }, [actions])

  useEffect(() => {
    if (state.tab === "results") void actions.loadResults()
  }, [state.tab, actions])

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <StageRail />
      {state.tab === "projects" && <ProjectsHome />}
      {state.tab === "ingest" && <IngestView />}
      {state.tab === "label" && <LabelView />}
      {state.tab === "review" && <ReviewView />}
      {state.tab === "train" && <TrainView />}
      {state.tab === "results" && <ResultsView />}
    </div>
  )
}

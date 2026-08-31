import { useRef, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useStudio } from "@/hooks/useStudio"
import { cn } from "@/lib/utils"

export function IngestView() {
  const { state, actions } = useStudio()
  const [logs, setLogs] = useState<string[]>([])
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function addLog(text: string) {
    setLogs((ls) => [...ls, text])
  }

  async function upload(files: File[]) {
    if (!files.length) return
    if (!state.live) {
      addLog(`[demo] ingest needs the server — ${files.length} file(s) ignored`)
      return
    }
    addLog(`uploading ${files.length} file(s)…`)
    try {
      const r = await actions.ingestFiles(files)
      addLog(`copied ${r.copied}, skipped ${r.skipped}`)
      await actions.reloadAnnotations()
    } catch (err) {
      addLog(`ingest failed: ${(err as Error).message}`)
    }
  }

  return (
    <section className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-6">
        <header>
          <h1 className="text-2xl font-semibold">Ingest</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Images or PDFs. PDFs are split into page images on arrival; duplicates are dropped by
            content hash.
          </p>
        </header>

        <div
          role="button"
          tabIndex={0}
          aria-label="Upload files"
          data-testid="dropzone"
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            over ? "border-primary bg-accent" : "border-border hover:bg-accent/50",
          )}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            void upload(Array.from(e.dataTransfer.files))
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-8 text-muted-foreground">
            <path
              d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <p className="text-sm text-muted-foreground">Drop files here or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            data-testid="file-input"
            onChange={(e) => {
              void upload(Array.from(e.target.files ?? []))
              e.target.value = ""
            }}
          />
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Log</CardTitle>
          </CardHeader>
          <CardContent>
            <pre
              data-testid="ingest-log"
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

import { ScrollArea } from "@/components/ui/scroll-area"
import { useStudio } from "@/hooks/useStudio"
import { imageUrl } from "@/lib/api"
import { demoThumb } from "@/lib/demo"
import { cn } from "@/lib/utils"

export function Filmstrip() {
  const { state, dispatch } = useStudio()
  return (
    <footer aria-label="Image queue" data-testid="filmstrip" className="shrink-0 border-t">
      <ScrollArea className="w-full">
        <div className="flex gap-2 px-3 py-2">
          {state.images.map((img) => {
            const isCurrent = img.id === state.current
            const edited = state.editedFrames.has(img.id)
            return (
              <button
                key={img.id}
                type="button"
                data-id={img.id}
                data-testid={`frame-${img.id}`}
                title={img.file_name}
                aria-label={img.file_name}
                onClick={() => dispatch({ type: "selectImage", id: img.id })}
                className={cn(
                  "relative size-20 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                  isCurrent ? "border-primary" : "border-transparent hover:border-muted-foreground/40",
                  edited && !isCurrent && "ring-2 ring-primary/60",
                )}
              >
                <img
                  src={state.live ? imageUrl(img.file_name, state.project) : demoThumb(img)}
                  alt=""
                  className="size-full object-cover"
                />
                {edited && (
                  <span
                    aria-hidden
                    data-testid={`lamp-${img.id}`}
                    className="absolute top-1 right-1 size-2 rounded-full bg-primary"
                  />
                )}
              </button>
            )
          })}
        </div>
      </ScrollArea>
    </footer>
  )
}

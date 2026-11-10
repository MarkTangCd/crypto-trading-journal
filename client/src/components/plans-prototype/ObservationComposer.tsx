// PROTOTYPE (TASK-72). Append-only observation input. Time is the moment it
// is logged (createdAt), never typed.
import { cn } from "@/lib/utils";
import type { Editor } from "@tiptap/react";
import { useRef, useState } from "react";
import { PlanEditor } from "./PlanEditor";
import { isEmptyDoc, planStore } from "./store";

export function ObservationComposer({
  planId,
  className,
  label = "log observation",
}: {
  planId: number;
  className?: string;
  label?: string;
}) {
  const editorRef = useRef<Editor | null>(null);
  // Remount the editor after each log to clear it.
  const [round, setRound] = useState(0);
  const [empty, setEmpty] = useState(true);

  const submit = () => {
    const json = editorRef.current?.getJSON() ?? null;
    if (isEmptyDoc(json) || !json) return;
    planStore.addObservation(planId, json);
    setRound(r => r + 1);
    setEmpty(true);
  };

  return (
    <div
      className={cn("space-y-2", className)}
      onKeyDown={event => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      }}
      onInput={() => setEmpty(editorRef.current?.isEmpty ?? true)}
    >
      <PlanEditor
        key={round}
        content={null}
        editable
        saveOnChange={false}
        editorRef={editorRef}
        placeholder="what is the market doing right now?"
        className="border-b border-border focus-within:border-foreground pb-2"
      />
      <div className="flex items-center justify-between gap-4">
        <span className="text-label">⌘↵ to log · time is stamped on log</span>
        <button
          type="button"
          onClick={submit}
          disabled={empty}
          className="text-sm hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          {label} →
        </button>
      </div>
    </div>
  );
}

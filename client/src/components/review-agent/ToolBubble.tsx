import { cn } from "@/lib/utils";
import type { ToolBubbleStatus } from "./useReviewStream";

interface ToolCallLineProps {
  name: string;
  argsSummary: string;
  status?: ToolBubbleStatus;
}

/**
 * Renders the assistant's request to invoke a tool as a single low-contrast
 * line: `tool · {name} · {argsSummary}`. Sits inline with messages; no
 * border, radius, or shadow — Bench Notebook brand.
 */
export function ToolCallLine({ name, argsSummary, status }: ToolCallLineProps) {
  return (
    <p className="font-mono text-xs text-muted-foreground tabular-nums lowercase break-all">
      <span>tool · </span>
      <span className="text-foreground">{name}</span>
      {argsSummary ? (
        <>
          <span> · </span>
          <span>{argsSummary}</span>
        </>
      ) : null}
      {status === "running" ? (
        <span className="ml-1 text-muted-foreground/70">— running…</span>
      ) : null}
    </p>
  );
}

interface ToolResultLineProps {
  ok: boolean;
  summary: string;
}

/**
 * Result paired with the call line above. Single line in the same low-
 * contrast register: `↳ ok · {summary}` or `↳ failed · {summary}`.
 */
export function ToolResultLine({ ok, summary }: ToolResultLineProps) {
  return (
    <p className="font-mono text-xs text-muted-foreground tabular-nums lowercase break-all">
      <span>↳ </span>
      <span className={cn(ok ? "text-foreground" : "text-destructive")}>
        {ok ? "ok" : "failed"}
      </span>
      {summary ? (
        <>
          <span> · </span>
          <span>{summary}</span>
        </>
      ) : null}
    </p>
  );
}

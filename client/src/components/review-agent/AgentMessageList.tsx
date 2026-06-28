import { Loader2 } from "lucide-react";
import { ToolCallLine, ToolResultLine } from "./ToolBubble";
import type { StreamPending } from "./useReviewStream";

export interface ReviewToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ReviewMessage {
  id: number;
  role: "system" | "user" | "assistant" | "tool";
  text: string;
  createdAt: number;
  toolCalls?: ReviewToolCall[];
  toolCallId?: string;
}

interface Props {
  messages: ReviewMessage[];
  pending: StreamPending | null;
  isWaiting: boolean;
}

const SUMMARY_MAX_CHARS = 200;

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + "…";
}

// A persisted tool turn writes either `{error: "..."}` on failure (sole key)
// or the raw tool return on success. Treat the single-error-key shape as the
// failure marker; real tools never wrap their result in `{error}`.
function isFailureContent(text: string): boolean {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed);
      return (
        keys.length === 1 &&
        keys[0] === "error" &&
        typeof (parsed as { error: unknown }).error === "string"
      );
    }
  } catch {
    // raw string fallback — treat as ok
  }
  return false;
}

/**
 * Renders the visible message thread. System messages are intentionally
 * hidden — they hold the agent's instructions, not user-facing content.
 * The first user turn carries the auto-injected trade context, folded into
 * a `<details>` summary. Tool-call sequences (assistant.toolCalls + the
 * following tool rows) render as low-contrast bubble lines inline.
 */
export function AgentMessageList({ messages, pending, isWaiting }: Props) {
  const visible = messages.filter(message => message.role !== "system");
  const hasPending = pending !== null;

  if (visible.length === 0 && !isWaiting && !hasPending) {
    return <p className="text-sm text-muted-foreground">正在生成初步复盘…</p>;
  }

  return (
    <div className="space-y-5">
      {visible.map((message, index) => {
        if (message.role === "user" && index === 0) {
          return (
            <details key={message.id} className="border-b border-border pb-3">
              <summary className="text-label cursor-pointer">
                已注入的交易上下文（点开查看）
              </summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">
                {message.text}
              </pre>
            </details>
          );
        }

        if (message.role === "tool") {
          return (
            <ToolResultLine
              key={message.id}
              ok={!isFailureContent(message.text)}
              summary={truncate(message.text, SUMMARY_MAX_CHARS)}
            />
          );
        }

        if (message.role === "assistant" && message.toolCalls?.length) {
          return (
            <div key={message.id} className="space-y-1">
              {message.toolCalls.map(call => (
                <ToolCallLine
                  key={call.id}
                  name={call.name}
                  argsSummary={truncate(call.arguments, SUMMARY_MAX_CHARS)}
                />
              ))}
              {message.text ? (
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.text}
                </p>
              ) : null}
            </div>
          );
        }

        return (
          <div key={message.id} className="space-y-1">
            <p className="text-label">
              {message.role === "assistant" ? "agent" : "you"}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {message.text}
            </p>
          </div>
        );
      })}

      {pending ? <PendingTurn pending={pending} /> : null}

      {isWaiting && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          agent 正在思考…
        </div>
      )}
    </div>
  );
}

function PendingTurn({ pending }: { pending: StreamPending }) {
  return (
    <>
      <div className="space-y-1">
        <p className="text-label">you</p>
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {pending.userText}
        </p>
      </div>
      {pending.toolBubbles.length > 0 ? (
        <div className="space-y-1">
          {pending.toolBubbles.map(bubble => (
            <div key={bubble.id} className="space-y-0.5">
              <ToolCallLine
                name={bubble.name}
                argsSummary={bubble.argsSummary}
                status={bubble.status}
              />
              {bubble.status !== "running" ? (
                <ToolResultLine
                  ok={bubble.status === "ok"}
                  summary={bubble.summary ?? ""}
                />
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {pending.assistantText ? (
        <div className="space-y-1">
          <p className="text-label">agent</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">
            {pending.assistantText}
          </p>
        </div>
      ) : null}
    </>
  );
}

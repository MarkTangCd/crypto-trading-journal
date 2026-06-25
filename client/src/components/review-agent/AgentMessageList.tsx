import { Loader2 } from "lucide-react";

export interface ReviewMessage {
  id: number;
  role: "system" | "user" | "assistant" | "tool";
  text: string;
  createdAt: number;
}

interface Props {
  messages: ReviewMessage[];
  isWaiting: boolean;
}

/**
 * Renders the visible message thread. System messages are intentionally
 * hidden — they hold the agent's instructions, not user-facing content.
 * The first user turn carries the auto-injected trade context: we render
 * it as a folded "context" pill so the user sees the agent has it without
 * being buried in prose.
 */
export function AgentMessageList({ messages, isWaiting }: Props) {
  const visible = messages.filter(message => message.role !== "system");

  if (visible.length === 0 && !isWaiting) {
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
          return null;
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
      {isWaiting && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          agent 正在思考…
        </div>
      )}
    </div>
  );
}

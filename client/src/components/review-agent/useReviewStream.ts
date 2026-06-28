import { useCallback, useEffect, useRef, useState } from "react";

const STREAM_URL = "/api/review-agent/stream";

export type ToolBubbleStatus = "running" | "ok" | "failed";

export interface ToolBubble {
  id: string;
  name: string;
  argsSummary: string;
  status: ToolBubbleStatus;
  summary?: string;
}

export interface StreamPending {
  userText: string;
  assistantText: string;
  toolBubbles: ToolBubble[];
}

interface UseReviewStreamOptions {
  conversationId: number | null;
  onDone?: (messageId: number) => void;
  onError?: (message: string) => void;
}

interface UseReviewStreamResult {
  start: (userText: string) => void;
  stop: () => void;
  isStreaming: boolean;
  pending: StreamPending | null;
}

type StreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      argsSummary: string;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      ok: boolean;
      summary: string;
    }
  | { type: "done"; messageId: number }
  | { type: "error"; message: string };

/**
 * Drives the SSE consumer for `/api/review-agent/stream`. Owns the
 * placeholder state so the drawer can render the user turn, in-flight tool
 * bubbles, and the growing assistant turn without touching AgentMessageList.
 * Callbacks (`onDone`, `onError`) are stashed in refs so callers don't have
 * to memoise them.
 */
export function useReviewStream(
  opts: UseReviewStreamOptions
): UseReviewStreamResult {
  const [pending, setPending] = useState<StreamPending | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const onDoneRef = useRef(opts.onDone);
  const onErrorRef = useRef(opts.onError);

  useEffect(() => {
    onDoneRef.current = opts.onDone;
    onErrorRef.current = opts.onError;
  }, [opts.onDone, opts.onError]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    []
  );

  const start = useCallback(
    async (userText: string) => {
      const conversationId = opts.conversationId;
      if (conversationId === null || abortRef.current) return;

      const abort = new AbortController();
      abortRef.current = abort;
      setPending({ userText, assistantText: "", toolBubbles: [] });

      let assembled = "";

      try {
        const res = await fetch(STREAM_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({ conversationId, userText }),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          throw new Error(`stream request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let finished = false;

        while (!finished) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let blank = buffer.indexOf("\n\n");
          while (blank !== -1 && !finished) {
            const rawEvent = buffer.slice(0, blank);
            buffer = buffer.slice(blank + 2);

            for (const line of rawEvent.split("\n")) {
              if (!line.startsWith("data:")) continue;
              const data = line.slice(5).trimStart();
              let parsed: StreamEvent | null = null;
              try {
                parsed = JSON.parse(data) as StreamEvent;
              } catch {
                continue;
              }
              if (parsed.type === "delta") {
                assembled += parsed.text;
                setPending(prev =>
                  prev ? { ...prev, assistantText: assembled } : prev
                );
              } else if (parsed.type === "tool_call") {
                const bubble: ToolBubble = {
                  id: parsed.id,
                  name: parsed.name,
                  argsSummary: parsed.argsSummary,
                  status: "running",
                };
                setPending(prev =>
                  prev
                    ? { ...prev, toolBubbles: [...prev.toolBubbles, bubble] }
                    : prev
                );
              } else if (parsed.type === "tool_result") {
                const { id, ok, summary } = parsed;
                setPending(prev =>
                  prev
                    ? {
                        ...prev,
                        toolBubbles: prev.toolBubbles.map(b =>
                          b.id === id
                            ? {
                                ...b,
                                status: ok ? "ok" : "failed",
                                summary,
                              }
                            : b
                        ),
                      }
                    : prev
                );
              } else if (parsed.type === "done") {
                finished = true;
                onDoneRef.current?.(parsed.messageId);
              } else if (parsed.type === "error") {
                finished = true;
                onErrorRef.current?.(parsed.message);
              }
            }

            blank = buffer.indexOf("\n\n");
          }
        }
      } catch (error) {
        // User-initiated abort: stay silent. Anything else → surface.
        const isAbort =
          abort.signal.aborted &&
          (error instanceof DOMException
            ? error.name === "AbortError"
            : error instanceof Error && /aborted/i.test(error.message));
        if (!isAbort) {
          onErrorRef.current?.("助手回复失败，请稍后再试。");
        }
      } finally {
        if (abortRef.current === abort) abortRef.current = null;
        setPending(null);
      }
    },
    [opts.conversationId]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { start, stop, isStreaming: pending !== null, pending };
}

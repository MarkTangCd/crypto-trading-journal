import type { Request, Response, Router } from "express";
import { Router as makeRouter } from "express";
import { z } from "zod";
import { streamUserMessage } from "../agents/reviewAgent";
import { ProviderError } from "../agents/providers/types";
import { createContext } from "./context";

const bodySchema = z.object({
  conversationId: z.number().int().positive(),
  userText: z.string().trim().min(1).max(4000),
});

function writeEvent(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * Mounts `POST /api/review-agent/stream`. Lives next to the tRPC middleware
 * because tRPC v11's `httpBatchLink` (the project's transport) doesn't carry
 * SSE — and adopting `httpSubscriptionLink` would force a client-wide link
 * refactor that's out of scope for Phase 2.
 *
 * Shares the anonymous-user resolution with tRPC via `createContext` so the
 * same `ctx.user.id` flows through `streamUserMessage`'s ownership guard.
 */
export function mountReviewAgentSseRoute(): Router {
  const router = makeRouter();

  router.post("/stream", async (req: Request, res: Response) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    let ctx;
    try {
      ctx = await createContext({ req, res, info: undefined as never });
    } catch (error) {
      console.error("[ReviewAgent SSE] createContext failed", error);
      res.status(500).json({ error: "无法解析当前用户" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Disable proxy buffering so the client sees deltas as they arrive.
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const abort = new AbortController();
    req.on("close", () => abort.abort());

    try {
      const events = streamUserMessage({
        userId: ctx.user.id,
        conversationId: parsed.data.conversationId,
        userText: parsed.data.userText,
        signal: abort.signal,
      });
      for await (const event of events) {
        if (abort.signal.aborted) break;
        writeEvent(res, event);
      }
    } catch (error) {
      // Errors thrown BEFORE the first yield (ownership / auth) — emit one
      // error event then close. Stream-internal errors are already surfaced
      // by the generator as `{type:"error"}` events.
      const message =
        error instanceof ProviderError
          ? error.message
          : "助手回复失败，请稍后再试。";
      writeEvent(res, { type: "error", message });
    } finally {
      res.end();
    }
  });

  return router;
}

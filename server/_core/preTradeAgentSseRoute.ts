import type { Request, Response, Router } from "express";
import { Router as makeRouter } from "express";
import { z } from "zod";
import { streamUserMessage } from "../agents/preTradeAgent";
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
 * Mounts `POST /api/pre-trade-agent/stream`. Sibling to the review-agent SSE
 * route with the same wire format; only the underlying service differs.
 */
export function mountPreTradeAgentSseRoute(): Router {
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
      console.error("[PreTradeAgent SSE] createContext failed", error);
      res.status(500).json({ error: "无法解析当前用户" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
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

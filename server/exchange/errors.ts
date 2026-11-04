import type { SyncErrorCode } from "@shared/const";

/** Thrown by adapters; `detail` is logged server-side only, never persisted or shown. */
export class ExchangeError extends Error {
  constructor(
    public readonly code: SyncErrorCode,
    public readonly detail: string
  ) {
    super(`${code}: ${detail}`);
    this.name = "ExchangeError";
  }
}

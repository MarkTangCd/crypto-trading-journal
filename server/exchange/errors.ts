import type { SyncErrorCode } from "@shared/const";

/** Thrown by adapters; `detail` is logged server-side only, never persisted or shown. */
export class ExchangeError extends Error {
  constructor(
    public readonly code: SyncErrorCode,
    public readonly detail: string,
    /** Earliest retry time (ms) for `rate_limited`, from `Retry-After`. */
    public readonly retryAt?: number
  ) {
    super(`${code}: ${detail}`);
    this.name = "ExchangeError";
  }
}

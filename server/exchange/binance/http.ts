import { createHmac } from "node:crypto";

import type { ExchangeCredentials } from "../adapter";
import { ExchangeError } from "../errors";

export const FAPI_BASE = "https://fapi.binance.com";
export const SAPI_BASE = "https://api.binance.com";

const RECV_WINDOW = 5000;
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_AFTER_MS = 60_000;
const INVALID_KEY_CODES = new Set([-2015, -2014, -2008]);

export interface BinanceHttpOptions {
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
}

export function sign(query: string, secret: string): string {
  return createHmac("sha256", secret).update(query).digest("hex");
}

export function mapBinanceError(
  status: number,
  body: string,
  retryAfter: string | null,
  now: number
): ExchangeError {
  const detail = `HTTP ${status}: ${body}`;
  if (status === 429 || status === 418) {
    const seconds = Number(retryAfter);
    const delayMs =
      retryAfter && Number.isFinite(seconds) && seconds >= 0
        ? seconds * 1000
        : DEFAULT_RETRY_AFTER_MS;
    return new ExchangeError("rate_limited", detail, now + delayMs);
  }
  const code = parseBinanceCode(body);
  if (status === 401 || (code !== undefined && INVALID_KEY_CODES.has(code))) {
    return new ExchangeError("invalid_key", detail);
  }
  if (code === -1021) return new ExchangeError("clock_skew", detail);
  if (status >= 500 || code === -1001) {
    return new ExchangeError("exchange_unavailable", detail);
  }
  return new ExchangeError("unknown", detail);
}

function parseBinanceCode(body: string): number | undefined {
  try {
    const parsed: unknown = JSON.parse(body);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      typeof parsed.code === "number"
    ) {
      return parsed.code;
    }
  } catch {
    // Non-JSON error bodies (HTML maintenance pages) carry no Binance code.
  }
  return undefined;
}

/** Signed USER_DATA GET; resolves to the parsed JSON body or throws ExchangeError. */
export async function signedGet(
  c: ExchangeCredentials,
  base: string,
  path: string,
  params: Record<string, string> = {},
  options: BinanceHttpOptions = {}
): Promise<unknown> {
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const query = new URLSearchParams({
    ...params,
    recvWindow: String(RECV_WINDOW),
    timestamp: String(now()),
  }).toString();
  const url = `${base}${path}?${query}&signature=${sign(query, c.apiSecret)}`;

  let res: Response;
  try {
    res = await doFetch(url, {
      method: "GET",
      headers: { "X-MBX-APIKEY": c.apiKey },
      signal: AbortSignal.timeout(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ExchangeError("network", `GET ${path}: ${describe(error)}`);
  }

  const weight = res.headers.get("x-mbx-used-weight-1m");
  if (weight) console.info(`[Binance] GET ${path} weight=${weight}`);

  let text: string;
  try {
    text = await res.text();
  } catch (error) {
    throw new ExchangeError("network", `GET ${path}: ${describe(error)}`);
  }
  if (!res.ok) {
    throw mapBinanceError(
      res.status,
      text,
      res.headers.get("retry-after"),
      now()
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ExchangeError("unknown", `GET ${path}: invalid JSON: ${text}`);
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    const cause =
      error.cause instanceof Error ? `: ${error.cause.message}` : "";
    return `${error.name}: ${error.message}${cause}`;
  }
  return String(error);
}

// Mirrors server-side close calculations for preview only. The server is
// authoritative and recomputes from the persisted plan when close runs.

export const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/;

export function parsePositiveDecimal(input: string | null): number | null {
  if (input === null) return null;
  const value = input.trim();
  if (!DECIMAL_PATTERN.test(value)) return null;
  const n = parseFloat(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type ClosePreview =
  | { kind: "missingExit" }
  | { kind: "invalidExit" }
  | {
      kind: "ok";
      actualRr: number;
      returnAmount: number;
      outcome: "win" | "loss" | "breakeven";
    };

export function previewClose(
  direction: string,
  entry: number,
  stopLoss: number,
  positionSize: number,
  exitStr: string
): ClosePreview {
  if (!exitStr.trim()) return { kind: "missingExit" };
  const exit = parsePositiveDecimal(exitStr);
  if (exit === null) return { kind: "invalidExit" };

  const isLong = direction === "long";
  const reward = isLong ? exit - entry : entry - exit;
  const risk = isLong ? entry - stopLoss : stopLoss - entry;
  if (risk <= 0) return { kind: "invalidExit" };

  const actualRr = reward / risk;
  const priceDelta = isLong ? exit - entry : entry - exit;
  const returnAmount = (positionSize * priceDelta) / entry;
  const rounded = Math.round(returnAmount * 100) / 100;
  const outcome: "win" | "loss" | "breakeven" =
    rounded > 0 ? "win" : rounded < 0 ? "loss" : "breakeven";
  return { kind: "ok", actualRr, returnAmount: rounded, outcome };
}

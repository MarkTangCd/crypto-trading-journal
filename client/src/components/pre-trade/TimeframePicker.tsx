import { INPUT_CLASS } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { TIME_FRAMES, type TimeFrame } from "@shared/const";

export interface ContextTimeframe {
  tf: TimeFrame;
  candleCount: number;
}

interface Props {
  primaryTf: TimeFrame | null;
  primaryCandleCount: number;
  contextTfs: ContextTimeframe[];
  onChange: (patch: {
    primaryTf?: TimeFrame | null;
    primaryCandleCount?: number;
    contextTfs?: ContextTimeframe[];
  }) => void;
  disabled?: boolean;
}

const MIN_COUNT = 20;
const MAX_COUNT = 500;
const MAX_CONTEXT = 4;
const DEFAULT_COUNT = 100;

function clampCount(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_COUNT;
  return Math.max(MIN_COUNT, Math.min(MAX_COUNT, Math.trunc(value)));
}

export function TimeframePicker({
  primaryTf,
  primaryCandleCount,
  contextTfs,
  onChange,
  disabled = false,
}: Props) {
  const contextByTf = new Map(contextTfs.map(entry => [entry.tf, entry]));
  const contextFull = contextTfs.length >= MAX_CONTEXT;

  const setPrimary = (tf: TimeFrame) => {
    if (disabled) return;
    if (primaryTf === tf) return;
    // If this tf was in context, drop it from the context list.
    const nextContext = contextTfs.filter(entry => entry.tf !== tf);
    onChange({ primaryTf: tf, contextTfs: nextContext });
  };

  const toggleContext = (tf: TimeFrame) => {
    if (disabled) return;
    if (tf === primaryTf) return;
    const existing = contextByTf.get(tf);
    if (existing) {
      onChange({ contextTfs: contextTfs.filter(entry => entry.tf !== tf) });
      return;
    }
    if (contextFull) return;
    onChange({
      contextTfs: [...contextTfs, { tf, candleCount: DEFAULT_COUNT }],
    });
  };

  const updateContextCount = (tf: TimeFrame, count: number) => {
    if (disabled) return;
    const next = contextTfs.map(entry =>
      entry.tf === tf ? { ...entry, candleCount: clampCount(count) } : entry
    );
    onChange({ contextTfs: next });
  };

  const updatePrimaryCount = (count: number) => {
    if (disabled) return;
    onChange({ primaryCandleCount: clampCount(count) });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[64px_84px_84px_1fr] gap-x-4 gap-y-2 text-label border-b border-border pb-2">
        <span>tf</span>
        <span>primary</span>
        <span>context</span>
        <span>candles</span>
      </div>
      <div className="space-y-1.5">
        {TIME_FRAMES.map(tf => {
          const isPrimary = primaryTf === tf;
          const isContext = contextByTf.has(tf);
          const count = isPrimary
            ? primaryCandleCount
            : (contextByTf.get(tf)?.candleCount ?? DEFAULT_COUNT);
          const contextDisabled =
            disabled || isPrimary || (!isContext && contextFull);
          const showCount = isPrimary || isContext;

          return (
            <div
              key={tf}
              className="grid grid-cols-[64px_84px_84px_1fr] gap-x-4 items-center py-1"
            >
              <span className="text-sm tabular-nums">{tf}</span>

              <label
                className={cn(
                  "inline-flex items-center gap-2 text-sm cursor-pointer",
                  disabled && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="radio"
                  name="pre-trade-primary-tf"
                  className="accent-foreground"
                  checked={isPrimary}
                  disabled={disabled}
                  onChange={() => setPrimary(tf)}
                />
                <span className="text-xs lowercase text-muted-foreground">
                  primary
                </span>
              </label>

              <label
                className={cn(
                  "inline-flex items-center gap-2 text-sm cursor-pointer",
                  contextDisabled && "cursor-not-allowed opacity-60"
                )}
              >
                <input
                  type="checkbox"
                  className="accent-foreground"
                  checked={isContext}
                  disabled={contextDisabled}
                  onChange={() => toggleContext(tf)}
                />
                <span className="text-xs lowercase text-muted-foreground">
                  context
                </span>
              </label>

              {showCount ? (
                <input
                  type="number"
                  min={MIN_COUNT}
                  max={MAX_COUNT}
                  step={10}
                  value={count}
                  disabled={disabled}
                  onChange={event =>
                    isPrimary
                      ? updatePrimaryCount(Number(event.target.value))
                      : updateContextCount(tf, Number(event.target.value))
                  }
                  onBlur={event => {
                    const clamped = clampCount(Number(event.target.value));
                    if (isPrimary) updatePrimaryCount(clamped);
                    else updateContextCount(tf, clamped);
                  }}
                  className={cn(INPUT_CLASS, "max-w-24 tabular-nums")}
                />
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </div>
          );
        })}
      </div>
      <div className="text-xs text-muted-foreground lowercase pt-1 border-t border-border">
        {contextFull
          ? `max ${MAX_CONTEXT} context tfs · uncheck one to switch`
          : `${MAX_CONTEXT - contextTfs.length} context slot${MAX_CONTEXT - contextTfs.length === 1 ? "" : "s"} left · candles 20–500`}
      </div>
    </div>
  );
}

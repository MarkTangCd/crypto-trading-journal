import {
  Field,
  INPUT_CLASS,
  SectionHeader,
  SELECT_CLASS,
  TEXTAREA_CLASS,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { TimeFrame } from "@shared/const";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "wouter";
import { type ContextTimeframe, TimeframePicker } from "./TimeframePicker";

type Direction = "long" | "short" | "";

interface Props {
  onCreated: (result: { preTradeId: number; conversationId: number }) => void;
}

const TRADING_PAIR_RE = /^[A-Z0-9]{4,20}$/;
// Rough bytes-per-candle estimate for the payload preview. Actual serialised
// tuple sits between 40 and 60 bytes depending on price precision; 48 is a
// safe mid-point for the "will this trip the 12kb warning?" heuristic.
const BYTES_PER_CANDLE = 48;
const PAYLOAD_WARN_BYTES = 12_000;

export function PreTradeSetup({ onCreated }: Props) {
  const [tradingPair, setTradingPair] = useState("");
  const [direction, setDirection] = useState<Direction>("");
  const [primaryTf, setPrimaryTf] = useState<TimeFrame | null>(null);
  const [primaryCandleCount, setPrimaryCandleCount] = useState(100);
  const [contextTfs, setContextTfs] = useState<ContextTimeframe[]>([]);
  const [idea, setIdea] = useState("");
  const [pickedProviderId, setPickedProviderId] = useState<string | null>(null);

  const providersQuery = trpc.settings.listProviders.useQuery();
  const defaultQuery = trpc.settings.getDefaultProvider.useQuery();

  const providers = providersQuery.data ?? [];
  const configuredProviders = providers.filter(p => p.hasKey);

  const createMutation = trpc.preTradeAgent.create.useMutation({
    onSuccess: result => {
      onCreated({
        preTradeId: result.preTradeId,
        conversationId: result.conversationId,
      });
    },
  });

  // Pre-select the user's default provider once configured providers land.
  if (
    pickedProviderId === null &&
    configuredProviders.length > 0 &&
    defaultQuery.data
  ) {
    const fallback =
      configuredProviders.find(p => p.id === defaultQuery.data?.defaultProvider)
        ?.id ?? configuredProviders[0].id;
    setPickedProviderId(fallback);
  }

  const pairValid = TRADING_PAIR_RE.test(tradingPair);
  const ideaValid = idea.trim().length > 0;
  const primaryValid = primaryTf !== null;

  const totalCandles =
    (primaryTf ? primaryCandleCount : 0) +
    contextTfs.reduce((sum, entry) => sum + entry.candleCount, 0);
  const approxBytes = totalCandles * BYTES_PER_CANDLE;
  const overPayloadWarn = approxBytes > PAYLOAD_WARN_BYTES;

  const canSubmit = useMemo(
    () =>
      pairValid &&
      ideaValid &&
      primaryValid &&
      pickedProviderId !== null &&
      !createMutation.isPending,
    [
      pairValid,
      ideaValid,
      primaryValid,
      pickedProviderId,
      createMutation.isPending,
    ]
  );

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || primaryTf === null || pickedProviderId === null) return;

    createMutation.mutate({
      tradingPair,
      direction: direction === "" ? null : direction,
      primaryTimeFrame: primaryTf,
      primaryCandleCount,
      contextTimeframes: contextTfs,
      anchorMs: null,
      idea: idea.trim(),
      providerId: pickedProviderId as
        | "deepseek"
        | "kimi"
        | "glm"
        | "openai"
        | "gemini",
    });
  };

  if (providersQuery.isLoading || defaultQuery.isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (configuredProviders.length === 0) {
    return (
      <div className="space-y-3 py-6">
        <p className="text-sm">还没有配置任何 provider 的 api key。</p>
        <p className="text-sm text-muted-foreground">
          请到{" "}
          <Link href="/settings" className="underline hover:text-foreground">
            Settings · AI 复盘助手
          </Link>{" "}
          填写后再回到这里。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <section className="space-y-6">
        <SectionHeader>instrument · idea</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
          <Field label="trading pair" htmlFor="tradingPair">
            <input
              id="tradingPair"
              type="text"
              placeholder="btcusdt"
              value={tradingPair}
              onChange={e => setTradingPair(e.target.value.toUpperCase())}
              className={cn(INPUT_CLASS, "uppercase")}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <Field label="direction (optional)" htmlFor="direction">
            <select
              id="direction"
              value={direction}
              onChange={e => setDirection(e.target.value as Direction)}
              className={SELECT_CLASS}
            >
              <option value="">—</option>
              <option value="long">long</option>
              <option value="short">short</option>
            </select>
          </Field>
          <Field label="anchor" htmlFor="anchor">
            <div id="anchor" className={cn(INPUT_CLASS, "cursor-default")}>
              now
            </div>
          </Field>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader>timeframes · candle count</SectionHeader>
        <TimeframePicker
          primaryTf={primaryTf}
          primaryCandleCount={primaryCandleCount}
          contextTfs={contextTfs}
          onChange={patch => {
            if (patch.primaryTf !== undefined) setPrimaryTf(patch.primaryTf);
            if (patch.primaryCandleCount !== undefined)
              setPrimaryCandleCount(patch.primaryCandleCount);
            if (patch.contextTfs !== undefined) setContextTfs(patch.contextTfs);
          }}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader>your idea</SectionHeader>
        <textarea
          value={idea}
          onChange={e => setIdea(e.target.value)}
          placeholder="想在 63.8k 支撑做 long，止损 62.5k，目标 68k。1h 有小背离但不明显……"
          rows={6}
          className={TEXTAREA_CLASS}
        />
      </section>

      <section className="space-y-4">
        <SectionHeader>provider</SectionHeader>
        <div
          role="radiogroup"
          aria-label="选择本笔讨论的 provider"
          className="flex flex-wrap gap-1.5"
        >
          {configuredProviders.map(meta => {
            const isSelected = meta.id === pickedProviderId;
            return (
              <button
                key={meta.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setPickedProviderId(meta.id)}
                className={cn(
                  "px-2.5 py-1 text-xs border transition-colors lowercase tabular-nums",
                  isSelected
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
                )}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </section>

      <div className="flex justify-between items-center border-t border-border pt-6">
        <div className="text-xs text-muted-foreground lowercase space-y-1">
          <div className="tabular-nums">
            context payload preview ·{" "}
            {primaryTf ? contextTfs.length + 1 : contextTfs.length} timeframes ·{" "}
            ~{totalCandles} candles · ~{Math.round(approxBytes / 100) / 10} kb
          </div>
          {overPayloadWarn && (
            <div className="text-[color:var(--loss)]">
              payload exceeds 12kb — server will trim context timeframes to fit
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={!canSubmit}
            className={cn(
              "px-4 py-2 text-sm lowercase tracking-wide border transition-colors",
              canSubmit
                ? "border-foreground bg-foreground text-background hover:bg-transparent hover:text-foreground"
                : "border-border text-muted-foreground cursor-not-allowed"
            )}
          >
            {createMutation.isPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" />
                starting…
              </span>
            ) : (
              "start discussion →"
            )}
          </button>
        </div>
      </div>

      {createMutation.error && (
        <div className="text-sm text-[color:var(--loss)]">
          {createMutation.error.message}
        </div>
      )}
    </form>
  );
}

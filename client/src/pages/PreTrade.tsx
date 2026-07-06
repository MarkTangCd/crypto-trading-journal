import { PreTradeChat } from "@/components/pre-trade/PreTradeChat";
import { PreTradeSetup } from "@/components/pre-trade/PreTradeSetup";
import { fmtDateTime } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";

/**
 * `/pre-trade` — setup form for a new discussion.
 * `/pre-trade/:id` — chat for an existing session.
 *
 * Split by URL rather than local state so refreshes / deep links resume the
 * exact session and the setup vs. chat modes stay orthogonal.
 */
export default function PreTrade() {
  const params = useParams<{ id?: string }>();
  const preTradeId = params.id ? Number.parseInt(params.id, 10) : null;

  if (preTradeId !== null && !Number.isNaN(preTradeId)) {
    return <PreTradeSession preTradeId={preTradeId} />;
  }

  return <NewPreTrade />;
}

function NewPreTrade() {
  const [, setLocation] = useLocation();
  const sessionsQuery = trpc.preTradeAgent.listSessions.useQuery();
  const sessions = sessionsQuery.data ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-16">
      <header className="space-y-2 pb-4 border-b border-border">
        <div className="text-label text-muted-foreground">pre-trade / new</div>
        <h1 className="text-2xl font-medium">new pre-trade discussion</h1>
        <p className="text-sm text-muted-foreground">
          pick your instrument, timeframes, and idea. context is built once —
          agent takes it from there.
        </p>
      </header>

      <PreTradeSetup
        onCreated={({ preTradeId }) => {
          void sessionsQuery.refetch();
          setLocation(`/pre-trade/${preTradeId}`);
        }}
      />

      {sessions.length > 0 && (
        <section className="space-y-3 pt-4 border-t border-border">
          <div className="text-label text-muted-foreground">
            past discussions
          </div>
          <ul className="divide-y divide-border">
            {sessions.map(session => (
              <li key={session.id}>
                <Link
                  href={`/pre-trade/${session.id}`}
                  className="flex justify-between items-baseline py-2.5 hover:bg-accent/40 -mx-2 px-2 transition-colors"
                >
                  <div className="flex flex-col">
                    <span className="text-sm tabular-nums">
                      {session.tradingPair.toLowerCase()} ·{" "}
                      {session.direction ?? "unspecified"} ·{" "}
                      {session.primaryTimeFrame.toLowerCase()} primary
                    </span>
                    <span className="text-xs text-muted-foreground line-clamp-1">
                      {session.idea}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground lowercase tabular-nums shrink-0 ml-4">
                    {fmtDateTime(new Date(session.createdAt))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

interface SessionProps {
  preTradeId: number;
}

function PreTradeSession({ preTradeId }: SessionProps) {
  const activeQuery = trpc.preTradeAgent.getActive.useQuery({ preTradeId });

  if (activeQuery.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeQuery.data) {
    return (
      <div className="max-w-3xl mx-auto py-12 space-y-4">
        <div className="text-label text-muted-foreground">
          pre-trade / #{preTradeId}
        </div>
        <h1 className="text-2xl font-medium">session not found</h1>
        <p className="text-sm text-muted-foreground">
          该 pre-trade 会话不存在或不属于当前账户。
        </p>
        <Link
          href="/pre-trade"
          className="inline-block text-sm underline hover:text-foreground"
        >
          ← start a new discussion
        </Link>
      </div>
    );
  }

  const { preTrade, conversationId, providerId } = activeQuery.data;

  const directionLabel = preTrade.direction ?? "unspecified";
  const contextSummary =
    preTrade.contextTimeframes.length === 0
      ? "no context tfs"
      : preTrade.contextTimeframes
          .map(
            (entry: { tf: string; candleCount: number }) =>
              `${entry.tf}·${entry.candleCount}`
          )
          .join(" · ");

  const convertQuery = new URLSearchParams({
    pair: preTrade.tradingPair,
    tf: preTrade.primaryTimeFrame,
    ...(preTrade.direction ? { direction: preTrade.direction } : {}),
  }).toString();

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-16">
      <header className="space-y-2 pb-4 border-b border-border">
        <div className="text-label text-muted-foreground">
          pre-trade / {preTrade.tradingPair.toLowerCase()} ·{" "}
          {preTrade.primaryTimeFrame.toLowerCase()} primary
        </div>
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <h1 className="text-2xl font-medium tabular-nums">
            {preTrade.tradingPair.toLowerCase()} · {directionLabel} · #
            {preTrade.id}
          </h1>
          <Link
            href={`/transactions/new?${convertQuery}`}
            className="text-xs lowercase tracking-wide px-3 py-1.5 border border-border hover:border-foreground hover:bg-accent/40 transition-colors"
          >
            convert to transaction →
          </Link>
        </div>
        <p className="text-xs text-muted-foreground lowercase tabular-nums">
          using {providerId} · primary {preTrade.primaryTimeFrame} ×{" "}
          {preTrade.primaryCandleCount} · context {contextSummary}
        </p>
        <div>
          <Link
            href="/pre-trade"
            className="text-xs text-muted-foreground underline hover:text-foreground lowercase"
          >
            ← start a new discussion
          </Link>
        </div>
      </header>

      <PreTradeChat preTradeId={preTradeId} conversationId={conversationId} />
    </div>
  );
}

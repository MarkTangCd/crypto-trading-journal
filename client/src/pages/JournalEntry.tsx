import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageSlot } from "@/components/journal/ImageSlot";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  INPUT_CLASS,
  SELECT_CLASS,
  fmtDayTime,
  fmtDecimal,
  fmtMoney,
  fmtRatio,
  toneClass,
} from "@/lib/ledger";
import { previewPlannedRiskReward } from "@/lib/plannedRiskReward";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EMOTIONS, SETUP_NAME_MAX, type Emotion } from "@shared/const";
import { isEmptyDoc, type RichTextDoc } from "@shared/richText";
import { utc8Parts } from "@shared/time";
import type { JournalEntry as JournalEntryRow, Trade } from "@shared/types";
import { Loader2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "wouter";
import { toast } from "sonner";

const LINK = "text-label hover:text-foreground transition-colors";
const NAME_LENGTH = `a name is 1 to ${SETUP_NAME_MAX} characters`;

type PriceField = "plannedEntry" | "plannedStopLoss" | "plannedTakeProfit";
type RichField = "entryReason" | "marketContext" | "invalidation";
type ReviewField = "mistakes" | "rules" | "managementDecisions" | "nextTime";

const PRICE_FIELDS: { key: PriceField; label: string }[] = [
  { key: "plannedEntry", label: "planned entry" },
  { key: "plannedStopLoss", label: "stop loss" },
  { key: "plannedTakeProfit", label: "take profit" },
];

const RICH_FIELDS: { key: RichField; label: string; hint: string }[] = [
  {
    key: "entryReason",
    label: "entry reason",
    hint: "why this trade, why now?",
  },
  {
    key: "marketContext",
    label: "market context",
    hint: "what is the market doing?",
  },
  {
    key: "invalidation",
    label: "invalidation",
    hint: "what proves the idea wrong?",
  },
];

const REVIEW_FIELDS: { key: ReviewField; label: string; hint: string }[] = [
  { key: "mistakes", label: "mistakes", hint: "what went wrong?" },
  {
    key: "rules",
    label: "rules followed or broken",
    hint: "which rules held, which broke?",
  },
  {
    key: "managementDecisions",
    label: "management decisions",
    hint: "stops moved, partials, adds, exits",
  },
  {
    key: "nextTime",
    label: "notes for next time",
    hint: "what will you do differently?",
  },
];

// doc-7 Notes, verbatim; never stored.
const REVIEW_PROMPTS = [
  "哪些方面做得好?",
  "哪些方面出了问题?",
  "我是否遵循了计划?",
  "我应该重复什么?",
  "我应该避免什么?",
  "主要教训是什么?",
  "下次我会做出哪些不同的做法?",
];

const px = (v: string | null) => fmtDecimal(v, 4);

const emotionLabel = (emotion: Emotion) =>
  emotion === "fomo" ? "FOMO" : emotion;

type Entry = JournalEntryRow & {
  trades: Trade[];
  setups: { id: number; name: string }[];
  sides: ("long" | "short")[];
  date: number | null;
  tradeCount: number;
  openTradeCount: number;
  netPnlUsd: number;
  actualR: number | null;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function Pnl({ value }: { value: number }) {
  const tone = value > 0 ? "win" : value < 0 ? "loss" : undefined;
  return (
    <span className={toneClass(tone)}>
      {value >= 0 ? "+" : "-"}${fmtMoney(Math.abs(value))}
    </span>
  );
}

function tradeLine(trade: Trade): string {
  return `${trade.side} ${fmtDecimal(trade.quantity)} @ ${px(trade.entryPrice)}${
    trade.exitPrice !== null ? ` → ${px(trade.exitPrice)}` : ""
  }`;
}

function stateWord(entry: Entry): string {
  if (entry.reviewedAt !== null) return "reviewed";
  return entry.openTradeCount > 0
    ? `${entry.openTradeCount} open`
    : "to review";
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-label border-b border-border pb-2">{label}</h3>
      {children}
    </section>
  );
}

export default function JournalEntry() {
  const params = useParams<{ id: string }>();
  const entryId = parseInt(params.id || "0");
  const {
    data: entry,
    isLoading,
    error,
  } = trpc.journal.get.useQuery(
    { id: entryId },
    { enabled: entryId > 0, retry: false }
  );
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  if (entryId > 0 && isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="space-y-4 max-w-3xl">
        <p className="text-title">
          {!error || error.data?.code === "NOT_FOUND"
            ? "journal entry not found"
            : "failed to load journal entry"}
        </p>
        <Link href="/journal" className={LINK}>
          ← journal
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-10 max-w-6xl pb-24">
      <div className="flex items-baseline justify-between gap-4">
        <Link href="/journal" className={LINK}>
          ← journal
        </Link>
        <span className="text-label tabular-nums" aria-live="polite">
          saved {utc8Parts(savedAt ?? entry.updatedAt).hhmm}
        </span>
      </div>

      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4">
        <h1 className="text-title">{entry.symbol}</h1>
        <p className="text-label tabular-nums">
          {entry.date === null ? "—" : fmtDayTime(entry.date)} ·{" "}
          {entry.sides.join(" / ")} · {plural(entry.tradeCount, "trade")} ·{" "}
          {stateWord(entry)}
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-y-16">
        <BeforePage entry={entry} onSaved={setSavedAt} />
        <AfterPage entry={entry} onSaved={setSavedAt} />
      </div>

      <EntryFooter entry={entry} />
    </div>
  );
}

function BeforePage({
  entry,
  onSaved,
}: {
  entry: Entry;
  onSaved: (updatedAt: Date) => void;
}) {
  const utils = trpc.useUtils();
  const editable = entry.reviewedAt === null;
  const [prices, setPrices] = useState<Record<PriceField, string>>({
    plannedEntry: entry.plannedEntry ?? "",
    plannedStopLoss: entry.plannedStopLoss ?? "",
    plannedTakeProfit: entry.plannedTakeProfit ?? "",
  });

  const update = trpc.journal.update.useMutation({
    onSuccess: ({ updatedAt }) => {
      onSaved(updatedAt);
      utils.journal.get.invalidate({ id: entry.id });
    },
    onError: error => {
      toast.error(
        error.data?.code === "BAD_REQUEST"
          ? "prices must be positive decimals"
          : error.message || "failed to save journal entry"
      );
    },
  });

  // Autosave: set the saved mark only; invalidating journal.get would race
  // the editors' pending keystrokes.
  const autosave = trpc.journal.update.useMutation({
    onSuccess: ({ updatedAt }) => onSaved(updatedAt),
    onError: error => {
      toast.error(error.message || "failed to save journal entry");
    },
  });

  const savePrice = (field: PriceField) => {
    const value = prices[field].trim();
    if (value === (entry[field] ?? "")) return;
    update.mutate({ id: entry.id, [field]: value === "" ? null : value });
  };

  // trades come back in openTime order, so the first is the earliest
  const planned = previewPlannedRiskReward(
    entry.trades[0]?.side ?? "",
    prices.plannedEntry.trim(),
    prices.plannedStopLoss.trim(),
    prices.plannedTakeProfit.trim()
  );

  return (
    <div className="space-y-10 lg:pr-12 lg:border-r lg:border-border">
      <div className="space-y-2">
        <p className="text-label">before · planned r:r</p>
        <p className="text-display tabular-nums">
          {planned.kind === "ok" ? fmtRatio(planned.value) : "—"}
        </p>
        <p className="text-label">
          {planned.kind === "invalid"
            ? planned.reason
            : planned.kind === "empty"
              ? "enter entry, stop and target"
              : "|target − entry| / |entry − stop|"}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {PRICE_FIELDS.map(field => (
          <label key={field.key} className="space-y-2 block">
            <span className="text-label block">{field.label}</span>
            <input
              type="text"
              inputMode="decimal"
              value={prices[field.key]}
              disabled={!editable}
              onChange={event =>
                setPrices({ ...prices, [field.key]: event.target.value })
              }
              onBlur={() => savePrice(field.key)}
              onKeyDown={event => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              placeholder="—"
              className={cn(
                INPUT_CLASS,
                "tabular-nums disabled:border-transparent"
              )}
            />
          </label>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        <SetupSelect entry={entry} editable={editable} onSaved={onSaved} />
        <label className="space-y-2 block">
          <span className="text-label block">emotion</span>
          <select
            value={entry.emotion ?? ""}
            disabled={!editable || update.isPending}
            onChange={event =>
              update.mutate({
                id: entry.id,
                emotion:
                  event.target.value === ""
                    ? null
                    : (event.target.value as Emotion),
              })
            }
            className={cn(
              SELECT_CLASS,
              "disabled:border-transparent disabled:cursor-default"
            )}
          >
            <option value="">—</option>
            {EMOTIONS.map(emotion => (
              <option key={emotion} value={emotion}>
                {emotionLabel(emotion)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {RICH_FIELDS.map(field => (
        <Block key={field.key} label={field.label}>
          <RichTextEditor
            owner={{ kind: "journal_entry", id: entry.id }}
            content={entry[field.key]}
            editable={editable}
            onSave={(doc: RichTextDoc) =>
              autosave.mutate({
                id: entry.id,
                [field.key]: isEmptyDoc(doc) ? null : doc,
              })
            }
            placeholder={field.hint}
          />
        </Block>
      ))}

      <Block label="before screenshots">
        <ScreenshotSlot
          entry={entry}
          slot="before"
          editable={editable}
          onSaved={onSaved}
        />
      </Block>
    </div>
  );
}

function AfterPage({
  entry,
  onSaved,
}: {
  entry: Entry;
  onSaved: (updatedAt: Date) => void;
}) {
  const unreviewed = entry.reviewedAt === null;
  const open = entry.openTradeCount;
  const reviewEditable = unreviewed && open === 0;

  // Autosave: set the saved mark only, as on the before page.
  const autosave = trpc.journal.update.useMutation({
    onSuccess: ({ updatedAt }) => onSaved(updatedAt),
    onError: error => {
      toast.error(error.message || "failed to save journal entry");
    },
  });

  const r = entry.actualR;
  const formula =
    open > 0
      ? `${open} of ${entry.tradeCount} trades still open`
      : entry.plannedEntry === null || entry.plannedStopLoss === null
        ? "set entry and stop to measure r"
        : r === null
          ? "entry equals stop"
          : "pnl / (|entry − stop| × qty)";

  return (
    <div className="space-y-10 lg:pl-12">
      <div className="space-y-2">
        <p className="text-label">after · actual r</p>
        {/* Not cn(): tailwind-merge drops text-display next to a color. */}
        <p
          className={`text-display tabular-nums ${
            open === 0 && r !== null
              ? toneClass(r > 0 ? "win" : r < 0 ? "loss" : undefined)
              : ""
          }`}
        >
          {open > 0
            ? "open"
            : r === null
              ? "—"
              : `${r >= 0 ? "+" : ""}${r.toFixed(2)}r`}
        </p>
        <p className="text-label tabular-nums">
          net <Pnl value={entry.netPnlUsd} /> · {formula}
        </p>
      </div>

      <LinkedTrades entry={entry} editable={unreviewed} />

      {open > 0 ? (
        <p className="text-sm border-y border-border py-4">
          waiting for {plural(open, "open trade")} to close. the review opens
          once binance reports every linked trade closed.
        </p>
      ) : (
        <div
          lang="zh"
          className="space-y-3 text-sm leading-relaxed border-y border-border py-5"
        >
          <p>交易结束后，问:</p>
          <ul className="space-y-1 pl-4">
            {REVIEW_PROMPTS.map(prompt => (
              <li key={prompt} className="list-['-_']">
                {prompt}
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            目标不是为每一笔交易写长篇笔记。目标是养成持续反思的习惯。
          </p>
        </div>
      )}

      {/* Stays mounted while locked so relocking keeps what was written. */}
      <div className={cn("space-y-10", open > 0 && "opacity-35")}>
        <Block label="after screenshots">
          <ScreenshotSlot
            entry={entry}
            slot="after"
            editable={reviewEditable}
            onSaved={onSaved}
          />
        </Block>
        {REVIEW_FIELDS.map(field => (
          <Block key={field.key} label={field.label}>
            <RichTextEditor
              owner={{ kind: "journal_entry", id: entry.id }}
              content={entry[field.key]}
              editable={reviewEditable}
              onSave={(doc: RichTextDoc) =>
                autosave.mutate({
                  id: entry.id,
                  [field.key]: isEmptyDoc(doc) ? null : doc,
                })
              }
              placeholder={field.hint}
            />
          </Block>
        ))}
      </div>
    </div>
  );
}

function LinkedTrades({
  entry,
  editable,
}: {
  entry: Entry;
  editable: boolean;
}) {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const { data: pickable, isLoading } = trpc.journal.pickableTrades.useQuery(
    { accountId: entry.accountId, symbol: entry.symbol },
    { enabled: editable && adding }
  );

  const onSuccess = () =>
    Promise.all([
      utils.journal.get.invalidate({ id: entry.id }),
      utils.journal.list.invalidate(),
      utils.journal.pickableTrades.invalidate(),
      utils.journal.forTrade.invalidate(),
    ]);
  const add = trpc.journal.addTrade.useMutation({
    onSuccess: () => {
      setAdding(false);
      return onSuccess();
    },
    onError: error => {
      toast.error(error.message || "failed to add trade");
    },
  });
  const remove = trpc.journal.removeTrade.useMutation({
    onSuccess,
    onError: error => {
      toast.error(error.message || "failed to unlink trade");
    },
  });
  const busy = add.isPending || remove.isPending;

  return (
    <section className="space-y-2">
      <h3 className="text-label border-b border-border pb-2">
        linked trades · {entry.tradeCount}
      </h3>
      <ul className="text-sm tabular-nums">
        {entry.trades.map(trade => (
          <li
            key={trade.id}
            className="grid grid-cols-[7.5rem_1fr_auto_1rem] gap-x-4 items-baseline py-2 border-b border-border group"
          >
            <span className="text-muted-foreground">
              {fmtDayTime(trade.openTime)}
            </span>
            <span>{tradeLine(trade)}</span>
            {trade.status === "open" ? (
              <span className="text-label">open</span>
            ) : (
              <Pnl value={parseFloat(trade.realizedPnlUsd)} />
            )}
            {editable && entry.trades.length > 1 ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  remove.mutate({ id: entry.id, tradeId: trade.id })
                }
                aria-label={`unlink trade opened ${fmtDayTime(trade.openTime)}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      {editable &&
        (adding ? (
          <div className="space-y-1 pt-2">
            {isLoading ? (
              <p className="text-label">loading trades…</p>
            ) : (pickable ?? []).length === 0 ? (
              <p className="text-label">
                no unlinked {entry.symbol.toLowerCase()} trades in this account.
              </p>
            ) : (
              <ul className="text-sm tabular-nums">
                {(pickable ?? []).map(trade => (
                  <li key={trade.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        add.mutate({ id: entry.id, tradeId: trade.id })
                      }
                      className="w-full grid grid-cols-[7.5rem_1fr_auto] gap-x-4 items-baseline py-2 text-left hover:bg-foreground/[0.03]"
                    >
                      <span className="text-muted-foreground">
                        {fmtDayTime(trade.openTime)}
                      </span>
                      <span>+ {tradeLine(trade)}</span>
                      <span className="text-label">{trade.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setAdding(false)}
              className={LINK}
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={cn(LINK, "pt-1")}
          >
            + add trade
          </button>
        ))}
    </section>
  );
}

function EntryFooter({ entry }: { entry: Entry }) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const [deleting, setDeleting] = useState(false);
  const open = entry.openTradeCount;
  const screenshotCount =
    entry.beforeImageIds.length + entry.afterImageIds.length;

  const invalidate = () =>
    Promise.all([
      utils.journal.get.invalidate({ id: entry.id }),
      utils.journal.list.invalidate(),
      utils.journal.forTrade.invalidate(),
    ]);

  const markReviewed = trpc.journal.markReviewed.useMutation({
    onSuccess: invalidate,
    onError: error => {
      toast.error(error.message || "failed to mark the entry reviewed");
    },
  });

  const reopen = trpc.journal.reopen.useMutation({
    onSuccess: invalidate,
    onError: error => {
      toast.error(error.message || "failed to reopen the entry");
    },
  });

  const remove = trpc.journal.delete.useMutation({
    onSuccess: () => {
      setLocation("/journal");
      // Mark stale without refetching: this page is still mounted for a
      // moment and the entry no longer exists.
      utils.journal.get.invalidate({ id: entry.id }, { refetchType: "none" });
      utils.journal.list.invalidate();
      utils.journal.forTrade.invalidate();
      utils.journal.pickableTrades.invalidate();
    },
    onError: error => {
      toast.error(error.message || "failed to delete the entry");
    },
  });

  return (
    <>
      <footer className="flex flex-wrap items-baseline justify-between gap-6 border-t border-border pt-6">
        {entry.reviewedAt !== null ? (
          <p className="text-sm tabular-nums">
            reviewed {fmtDayTime(entry.reviewedAt)} ·{" "}
            <button
              type="button"
              disabled={reopen.isPending}
              onClick={() => reopen.mutate({ id: entry.id })}
              className="underline underline-offset-4 disabled:opacity-40"
            >
              reopen
            </button>
          </p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-4">
            <button
              type="button"
              disabled={open > 0 || markReviewed.isPending}
              onClick={() => markReviewed.mutate({ id: entry.id })}
              className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
            >
              mark reviewed →
            </button>
            {open > 0 && (
              <span className="text-label">
                after every linked trade closes
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className={LINK}
        >
          delete entry
        </button>
      </footer>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete this journal entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {plural(screenshotCount, "screenshot")} and every written field go
              with it. the {plural(entry.tradeCount, "trade")}{" "}
              {entry.tradeCount === 1 ? "stays" : "stay"} and can be picked
              again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: entry.id })}
            >
              delete entry
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ScreenshotSlot({
  entry,
  slot,
  editable,
  onSaved,
}: {
  entry: Entry;
  slot: "before" | "after";
  editable: boolean;
  onSaved: (updatedAt: Date) => void;
}) {
  const utils = trpc.useUtils();
  // ImageSlot toasts failures; these only refresh the entry.
  const onSuccess = () => {
    onSaved(new Date());
    return utils.journal.get.invalidate({ id: entry.id });
  };
  const add = trpc.journal.addSlotImage.useMutation({ onSuccess });
  const remove = trpc.journal.removeSlotImage.useMutation({ onSuccess });

  return (
    <ImageSlot
      imageIds={slot === "before" ? entry.beforeImageIds : entry.afterImageIds}
      owner={{ kind: "journal_entry", id: entry.id }}
      editable={editable}
      onAdd={imageId => add.mutateAsync({ id: entry.id, slot, imageId })}
      onRemove={imageId => remove.mutateAsync({ id: entry.id, slot, imageId })}
    />
  );
}

function SetupSelect({
  entry,
  editable,
  onSaved,
}: {
  entry: Entry;
  editable: boolean;
  onSaved: (updatedAt: Date) => void;
}) {
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { data: setups, isLoading } = trpc.setup.list.useQuery(undefined, {
    enabled: editable,
  });
  const linkedIds = entry.setups.map(setup => setup.id);
  const names = entry.setups.map(setup => setup.name).join(", ") || "—";

  // Stay pending until journal.get refetches, so the next toggle starts
  // from the saved set.
  const save = trpc.journal.setSetups.useMutation({
    onSuccess: () => {
      // setSetups returns no updatedAt; links don't touch the entry row.
      onSaved(new Date());
      return Promise.all([
        utils.journal.get.invalidate({ id: entry.id }),
        utils.journal.list.invalidate(),
        utils.setup.list.invalidate(),
      ]);
    },
    onError: error => {
      toast.error(error.message || "failed to save setups");
    },
  });

  const create = trpc.setup.create.useMutation({
    onSuccess: ({ id }) => {
      utils.setup.list.invalidate();
      setDraft("");
      setError(null);
      save.mutate({ id: entry.id, setupIds: [...linkedIds, id] });
    },
    onError: error => {
      const code = error.data?.code;
      if (code === "CONFLICT") setError("name taken");
      else if (code === "BAD_REQUEST") setError(NAME_LENGTH);
      else toast.error(error.message || "failed to create setup");
    },
  });

  const busy = save.isPending || create.isPending;

  const toggle = (id: number) =>
    save.mutate({
      id: entry.id,
      setupIds: linkedIds.includes(id)
        ? linkedIds.filter(x => x !== id)
        : [...linkedIds, id],
    });

  return (
    <div className="space-y-2">
      <span className="text-label block">setups</span>
      {!editable ? (
        <p className="text-sm py-1.5">{names}</p>
      ) : (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger className={cn(INPUT_CLASS, "text-left")}>
            {names}
          </PopoverTrigger>
          <PopoverContent
            align="start"
            className="w-(--radix-popover-trigger-width) min-w-64 bg-background border-border p-3 space-y-2"
          >
            {isLoading ? (
              <p className="text-label">loading setups…</p>
            ) : (setups ?? []).length === 0 ? (
              <p className="text-sm">no setups yet. name one below.</p>
            ) : (
              <ul className="space-y-1">
                {(setups ?? []).map(setup => (
                  <li key={setup.id}>
                    <label className="flex items-center gap-3 text-sm cursor-pointer py-1">
                      <input
                        type="checkbox"
                        checked={linkedIds.includes(setup.id)}
                        disabled={busy}
                        onChange={() => toggle(setup.id)}
                        className="accent-foreground h-4 w-4"
                      />
                      {setup.name}
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <form
              className="border-t border-border pt-2"
              onSubmit={event => {
                event.preventDefault();
                const name = draft.trim();
                if (name.length < 1 || name.length > SETUP_NAME_MAX) {
                  setError(NAME_LENGTH);
                  return;
                }
                create.mutate({ name });
              }}
            >
              <input
                type="text"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                placeholder="+ new setup ⏎"
                aria-label="new setup name"
                maxLength={SETUP_NAME_MAX}
                disabled={busy}
                className={cn(INPUT_CLASS, "placeholder:normal-case")}
              />
              {error && <p className="text-label pt-1">{error}</p>}
            </form>
            <div className="flex justify-between pt-1">
              <Link href="/journal/setups" className={LINK}>
                manage setups
              </Link>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className={LINK}
              >
                done
              </button>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

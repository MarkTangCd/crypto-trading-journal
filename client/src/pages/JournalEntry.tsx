import { RichTextEditor } from "@/components/RichTextEditor";
import { ImageSlot } from "@/components/journal/ImageSlot";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { INPUT_CLASS, SELECT_CLASS, fmtDayTime, fmtRatio } from "@/lib/ledger";
import { previewPlannedRiskReward } from "@/lib/plannedRiskReward";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { EMOTIONS, SETUP_NAME_MAX, type Emotion } from "@shared/const";
import { isEmptyDoc, type RichTextDoc } from "@shared/richText";
import { utc8Parts } from "@shared/time";
import type { JournalEntry as JournalEntryRow, Trade } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";

const LINK = "text-label hover:text-foreground transition-colors";
const NAME_LENGTH = `a name is 1 to ${SETUP_NAME_MAX} characters`;

type PriceField = "plannedEntry" | "plannedStopLoss" | "plannedTakeProfit";
type RichField = "entryReason" | "marketContext" | "invalidation";

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

const emotionLabel = (emotion: Emotion) =>
  emotion === "fomo" ? "FOMO" : emotion;

type Entry = JournalEntryRow & {
  trades: Trade[];
  setups: { id: number; name: string }[];
  sides: ("long" | "short")[];
  date: number | null;
  tradeCount: number;
  openTradeCount: number;
};

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
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
        <div className="space-y-10 lg:pl-12">
          <p className="text-label">after · actual r</p>
        </div>
      </div>
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

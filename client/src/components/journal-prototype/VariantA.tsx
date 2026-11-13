// PROTOTYPE (TASK-88). Variant A, "ledger": the Plans A grammar carried
// over. One column, symbol as the display hero, the picker unfolds inline
// under the /journal header, recording then review down one page.
import { INPUT_CLASS, SELECT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type { Trade as RealTrade } from "@shared/types";
import { X } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Link } from "wouter";
import {
  DeleteEntryDialog,
  Pnl,
  ReviewPrompts,
  RichField,
  ShotSlot,
  day,
  dayTime,
  fmtR,
  hhmm,
  plural,
  pnlToneClass,
  tradeLine,
  useJournalNav,
  usePicker,
  usePreselectedTrade,
} from "./shared";
import {
  ACCOUNTS,
  CURRENT_ACCOUNT_ID,
  EMOTIONS,
  actions,
  actualR,
  entryAccountId,
  entryDate,
  entryForTrade,
  entrySides,
  entrySymbol,
  netPnl,
  openCount,
  pickableTrades,
  plannedRR,
  realTradeKey,
  setupUsage,
  sortedEntries,
  tradesOf,
  useJournal,
  type Emotion,
  type JournalEntry,
  type PriceField,
  type RichField as RichFieldName,
  type Trade,
} from "./store";

const ROW_CLASS =
  "grid grid-cols-[1.25rem_4.5rem_1fr_auto] sm:grid-cols-[1.25rem_4.5rem_1fr_5rem_7rem] gap-x-4 items-baseline py-3 border-b border-border text-sm hover:bg-foreground/[0.03]";

// Hollow = unreviewed, filled = reviewed. Ink only.
function stateGlyph(reviewed: boolean) {
  return reviewed ? "●" : "○";
}

// ---------- /journal ----------

function PickerA({
  preselect,
  onCancel,
}: {
  preselect: number[];
  onCancel: () => void;
}) {
  const { go } = useJournalNav();
  const picker = usePicker(preselect);
  const account = ACCOUNTS.find(a => a.id === CURRENT_ACCOUNT_ID);

  return (
    <section aria-label="pick trades" className="space-y-4">
      <SectionHeader>
        pick the trades this entry is about · binance {account?.name}
      </SectionHeader>
      <div className="flex items-end gap-4">
        <input
          type="text"
          value={picker.query}
          onChange={event => picker.setQuery(event.target.value)}
          placeholder="filter by symbol"
          aria-label="filter by symbol"
          className={cn(INPUT_CLASS, "max-w-xs placeholder:normal-case")}
          autoFocus
        />
        {picker.lockedSymbol && (
          <span className="text-label pb-1.5">
            only {picker.lockedSymbol.toLowerCase()} now: one entry, one symbol
          </span>
        )}
      </div>
      {picker.visible.length === 0 ? (
        <p className="text-sm py-2">
          no trades left to journal
          {picker.query ? " for this symbol" : ""}. every synced trade on this
          account already sits in an entry.
        </p>
      ) : (
        <ul className="max-h-[22rem] overflow-y-auto">
          {picker.visible.map(t => {
            const disabled = picker.isDisabled(t);
            const checked = picker.selected.includes(t.id);
            return (
              <li key={t.id}>
                <label
                  className={cn(
                    "grid grid-cols-[1.25rem_7rem_1fr_auto] gap-x-4 items-baseline py-2 border-b border-border text-sm tabular-nums cursor-pointer",
                    disabled && "opacity-35 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => picker.toggle(t.id)}
                    className="accent-foreground"
                  />
                  <span className="text-muted-foreground">
                    {dayTime(t.openTime)}
                  </span>
                  <span>
                    <span className="font-medium">
                      {t.symbol.toLowerCase()}
                    </span>{" "}
                    {tradeLine(t)}
                  </span>
                  {t.status === "open" ? (
                    <span className="text-label">open</span>
                  ) : (
                    <Pnl value={t.realizedPnlUsd} className="text-right" />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-6">
        <button
          type="button"
          disabled={!picker.canCreate}
          onClick={() => go(`/journal/${picker.create()}`)}
          className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
        >
          {picker.canCreate
            ? `start entry · ${plural(picker.selected.length, "trade")} →`
            : "tick at least one trade"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-label hover:text-foreground"
        >
          cancel
        </button>
      </div>
    </section>
  );
}

export function ListA() {
  const s = useJournal();
  const { href } = useJournalNav();
  const preselected = usePreselectedTrade();
  const [picking, setPicking] = useState(preselected !== null);
  const entries = sortedEntries(s);
  const unreviewed = entries.filter(e => e.reviewedAt === null).length;
  const pickable = pickableTrades(s).length;

  return (
    <div className="space-y-12 max-w-3xl">
      <header className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-title">journal</h1>
          <p className="text-label">
            why each trade was taken, and what it taught
          </p>
        </div>
        <Link
          href={href("/journal/setups")}
          className="text-label hover:text-foreground pt-3"
        >
          setups →
        </Link>
      </header>

      {picking ? (
        <PickerA
          preselect={preselected !== null ? [preselected] : []}
          onCancel={() => setPicking(false)}
        />
      ) : (
        <div className="flex items-baseline gap-6">
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90"
          >
            new journal entry →
          </button>
          <span className="text-label tabular-nums">
            {plural(pickable, "trade")} not journaled yet
          </span>
        </div>
      )}

      <section aria-labelledby="entries-label">
        <SectionHeader id="entries-label">
          entries · {entries.length}
          {unreviewed > 0 && ` · ${unreviewed} unreviewed`}
        </SectionHeader>
        {entries.length === 0 ? (
          <p className="py-4 text-sm">
            no journal entries yet. pick a trade above to write the first one.
          </p>
        ) : (
          <ul>
            {entries.map(entry => (
              <EntryRowA key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
        <p className="text-label pt-4">
          ○ unreviewed · ● reviewed · dated by the first trade's open, utc+8
        </p>
      </section>
    </div>
  );
}

function EntryRowA({ entry }: { entry: JournalEntry }) {
  const s = useJournal();
  const { href } = useJournalNav();
  const trades = tradesOf(s, entry);
  const open = openCount(s, entry);
  const setups = entry.setupIds
    .map(id => s.setups.find(x => x.id === id)?.name)
    .filter(Boolean);
  const accountId = entryAccountId(s, entry);

  return (
    <li>
      <Link href={href(`/journal/${entry.id}`)} className={ROW_CLASS}>
        <span
          aria-label={entry.reviewedAt ? "reviewed" : "unreviewed"}
          className="text-xs"
        >
          {stateGlyph(entry.reviewedAt !== null)}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {day(entryDate(s, entry))}
        </span>
        <span className="min-w-0 truncate">
          <span className="font-medium">
            {entrySymbol(s, entry).toLowerCase()}
          </span>{" "}
          {entrySides(s, entry).join(" + ")}
          {setups.length > 0 && (
            <span className="text-label"> · {setups.join(", ")}</span>
          )}
          {accountId !== CURRENT_ACCOUNT_ID && (
            <span className="text-label">
              {" "}
              · {ACCOUNTS.find(a => a.id === accountId)?.name}
            </span>
          )}
        </span>
        <span className="hidden sm:block text-label tabular-nums text-right">
          {open > 0 ? `${open} open` : plural(trades.length, "trade")}
        </span>
        <Pnl value={netPnl(s, entry)} className="text-right" />
      </Link>
    </li>
  );
}

// ---------- /journal/:id ----------

function Block({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-medium">{label}</h3>
        {hint && <span className="text-label">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function LinkedTradesA({
  entry,
  editable,
}: {
  entry: JournalEntry;
  editable: boolean;
}) {
  const s = useJournal();
  const [adding, setAdding] = useState(false);
  const trades = tradesOf(s, entry);
  const symbol = entrySymbol(s, entry);
  const addable = pickableTrades(s).filter(t => t.symbol === symbol);

  return (
    <section aria-labelledby="trades-label" className="space-y-1">
      <SectionHeader id="trades-label">
        {plural(trades.length, "trade")}
      </SectionHeader>
      <ul>
        {trades.map(t => (
          <TradeRowA
            key={t.id}
            trade={t}
            onRemove={
              editable && trades.length > 1
                ? () =>
                    actions.setTrades(
                      entry.id,
                      entry.tradeIds.filter(id => id !== t.id)
                    )
                : undefined
            }
          />
        ))}
      </ul>
      {editable &&
        (adding ? (
          <div className="pt-3 space-y-1">
            <p className="text-label">
              add another {symbol.toLowerCase()} trade
            </p>
            {addable.length === 0 ? (
              <p className="text-sm py-2">
                no other {symbol.toLowerCase()} trades to add.
              </p>
            ) : (
              <ul>
                {addable.map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        actions.setTrades(entry.id, [...entry.tradeIds, t.id]);
                        setAdding(false);
                      }}
                      className="w-full grid grid-cols-[7rem_1fr_auto] gap-x-4 items-baseline py-2 border-b border-border text-sm tabular-nums text-left hover:bg-foreground/[0.03]"
                    >
                      <span className="text-muted-foreground">
                        {dayTime(t.openTime)}
                      </span>
                      <span>{tradeLine(t)}</span>
                      <span className="text-label">add +</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="text-label hover:text-foreground pt-2"
            >
              cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="text-label hover:text-foreground pt-3"
          >
            + add trade
          </button>
        ))}
    </section>
  );
}

function TradeRowA({
  trade,
  onRemove,
}: {
  trade: Trade;
  onRemove?: () => void;
}) {
  return (
    <li className="group grid grid-cols-[7rem_1fr_auto_1.25rem] gap-x-4 items-baseline py-3 border-b border-border text-sm tabular-nums">
      <span className="text-muted-foreground">{dayTime(trade.openTime)}</span>
      <span>
        {tradeLine(trade)}
        {trade.closeTime !== null && (
          <span className="text-label"> · closed {hhmm(trade.closeTime)}</span>
        )}
      </span>
      {trade.status === "open" ? (
        <span className="text-label">open</span>
      ) : (
        <Pnl value={trade.realizedPnlUsd} className="text-right" />
      )}
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label="remove trade from entry"
          className="opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-foreground text-muted-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span />
      )}
    </li>
  );
}

function SetupChipsA({
  entry,
  editable,
}: {
  entry: JournalEntry;
  editable: boolean;
}) {
  const s = useJournal();
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: number) =>
    actions.setSetups(
      entry.id,
      entry.setupIds.includes(id)
        ? entry.setupIds.filter(x => x !== id)
        : [...entry.setupIds, id]
    );

  if (!editable) {
    const names = entry.setupIds
      .map(id => s.setups.find(x => x.id === id)?.name)
      .filter(Boolean);
    return <p className="text-sm">{names.length ? names.join(" · ") : "—"}</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {s.setups.map(setup => {
          const on = entry.setupIds.includes(setup.id);
          return (
            <button
              key={setup.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(setup.id)}
              className={cn(
                "border px-2.5 py-1 text-sm transition-colors",
                on
                  ? "bg-foreground text-background border-foreground"
                  : "border-border hover:border-foreground"
              )}
            >
              {setup.name}
            </button>
          );
        })}
        {draft === null ? (
          <button
            type="button"
            onClick={() => setDraft("")}
            className="px-2.5 py-1 text-label hover:text-foreground"
          >
            + new setup
          </button>
        ) : (
          <form
            onSubmit={event => {
              event.preventDefault();
              const result = actions.createSetup(draft);
              if (typeof result === "string") return setError(result);
              actions.setSetups(entry.id, [...entry.setupIds, result]);
              setDraft(null);
              setError(null);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onBlur={() => !draft.trim() && setDraft(null)}
              onKeyDown={event => event.key === "Escape" && setDraft(null)}
              placeholder="setup name, enter to add"
              className={cn(INPUT_CLASS, "w-56 placeholder:normal-case")}
            />
          </form>
        )}
      </div>
      {error && <p className="text-label">{error}</p>}
    </div>
  );
}

const PRICE_FIELDS: { field: PriceField; label: string }[] = [
  { field: "plannedEntry", label: "planned entry" },
  { field: "plannedStop", label: "stop loss" },
  { field: "plannedTarget", label: "take profit" },
];

const REVIEW_FIELDS: { field: RichFieldName; label: string; hint: string }[] = [
  { field: "mistakes", label: "mistakes", hint: "what went wrong" },
  {
    field: "rulesFollowed",
    label: "rules followed or broken",
    hint: "against your own rules",
  },
  {
    field: "managementDecisions",
    label: "management decisions",
    hint: "stops moved, partials, exits",
  },
  {
    field: "notesForNext",
    label: "notes for next time",
    hint: "one thing to carry forward",
  },
];

export function EntryA({ entryId }: { entryId: number }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const [deleting, setDeleting] = useState(false);
  const entry = s.entries.find(e => e.id === entryId);

  if (!entry) {
    return (
      <div className="space-y-4 max-w-3xl">
        <p className="text-title">entry not found</p>
        <Link href={href("/journal")} className="text-sm hover:underline">
          ← journal
        </Link>
      </div>
    );
  }

  const reviewed = entry.reviewedAt !== null;
  const open = openCount(s, entry);
  const recordingEditable = !reviewed;
  const reviewEditable = !reviewed && open === 0;
  const planned = plannedRR(s, entry);
  const actual = actualR(s, entry);
  const trades = tradesOf(s, entry);
  const rich = (
    field: RichFieldName,
    editable: boolean,
    placeholder: string
  ) => (
    <RichField
      key={`${field}-${editable}`}
      value={entry[field]}
      editable={editable}
      onSave={doc => actions.setRich(entry.id, field, doc)}
      placeholder={placeholder}
    />
  );

  return (
    <div className="space-y-12 max-w-3xl pb-24">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href={href("/journal")}
          className="text-label hover:text-foreground"
        >
          ← journal
        </Link>
        <span className="text-label tabular-nums" aria-live="polite">
          saved {hhmm(entry.updatedAt)}
        </span>
      </div>

      <header className="space-y-3">
        <h1 className="text-display">{entrySymbol(s, entry)}</h1>
        <p className="text-label tabular-nums">
          {entrySides(s, entry).join(" + ")} · {dayTime(entryDate(s, entry))} ·{" "}
          {reviewed
            ? `reviewed ${dayTime(entry.reviewedAt ?? 0)}`
            : open > 0
              ? `unreviewed · ${open} open`
              : "unreviewed · ready to review"}
        </p>
        <p className="text-sm tabular-nums">
          planned r:r {planned.kind === "ok" ? planned.value.toFixed(2) : "—"}
          <span className="text-muted-foreground"> · </span>
          actual{" "}
          <span
            className={actual.kind === "ok" ? pnlToneClass(actual.value) : ""}
          >
            {fmtR(actual)}
          </span>
          <span className="text-muted-foreground"> · </span>
          net <Pnl value={netPnl(s, entry)} />
        </p>
      </header>

      <LinkedTradesA entry={entry} editable={!reviewed} />

      <section aria-labelledby="recording-label" className="space-y-10">
        <SectionHeader id="recording-label">
          recording · before and at the entry
        </SectionHeader>

        <Block label="setups">
          <SetupChipsA entry={entry} editable={recordingEditable} />
        </Block>

        <Block
          label="plan"
          hint={planned.kind === "invalid" ? planned.reason : undefined}
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-4 items-end">
            {PRICE_FIELDS.map(({ field, label }) => (
              <label key={field} className="space-y-1">
                <span className="text-label block">{label}</span>
                <input
                  value={entry[field]}
                  readOnly={!recordingEditable}
                  inputMode="decimal"
                  onChange={event =>
                    actions.setPrice(entry.id, field, event.target.value)
                  }
                  className={cn(INPUT_CLASS, "tabular-nums")}
                />
              </label>
            ))}
            <div className="space-y-1">
              <span className="text-label block">planned r:r</span>
              <span className="text-heading tabular-nums block py-0.5">
                {planned.kind === "ok" ? planned.value.toFixed(2) : "—"}
              </span>
            </div>
          </div>
        </Block>

        <Block label="emotion">
          <select
            value={entry.emotion ?? ""}
            disabled={!recordingEditable}
            onChange={event =>
              actions.setEmotion(
                entry.id,
                event.target.value ? (event.target.value as Emotion) : null
              )
            }
            className={cn(SELECT_CLASS, "max-w-xs")}
          >
            <option value="">—</option>
            {EMOTIONS.map(emotion => (
              <option key={emotion} value={emotion}>
                {emotion}
              </option>
            ))}
          </select>
        </Block>

        <Block label="entry reason">
          {rich("entryReason", recordingEditable, "why this trade, why now?")}
        </Block>
        <Block label="market context">
          {rich(
            "marketContext",
            recordingEditable,
            "what was the market doing?"
          )}
        </Block>
        <Block label="invalidation">
          {rich(
            "invalidation",
            recordingEditable,
            "what would prove this wrong?"
          )}
        </Block>
        <Block label="before screenshots">
          <ShotSlot
            shots={entry.beforeShots}
            editable={recordingEditable}
            label="before"
            onAdd={src => actions.addShot(entry.id, "beforeShots", src)}
            onRemove={id => actions.removeShot(entry.id, "beforeShots", id)}
          />
        </Block>
      </section>

      <section aria-labelledby="review-label" className="space-y-10">
        <SectionHeader id="review-label">
          review · after the close
        </SectionHeader>
        {open > 0 && (
          <p className="text-sm">
            waiting for {plural(open, "open trade")} to close. the review opens
            once every trade in this entry has closed.
          </p>
        )}
        <div
          className={cn(
            "space-y-10",
            open > 0 && "opacity-40 pointer-events-none select-none"
          )}
          aria-disabled={open > 0}
        >
          <ReviewPrompts />
          <Block label="actual r" hint="net pnl ÷ (|entry − stop| × quantity)">
            <p
              className={cn(
                "text-heading tabular-nums",
                actual.kind === "ok" && pnlToneClass(actual.value)
              )}
            >
              {fmtR(actual)}
            </p>
          </Block>
          <Block label="after screenshots">
            <ShotSlot
              shots={entry.afterShots}
              editable={reviewEditable}
              label="after"
              onAdd={src => actions.addShot(entry.id, "afterShots", src)}
              onRemove={id => actions.removeShot(entry.id, "afterShots", id)}
            />
          </Block>
          {REVIEW_FIELDS.map(({ field, label, hint }) => (
            <Block key={field} label={label} hint={hint}>
              {rich(field, reviewEditable, "")}
            </Block>
          ))}
        </div>
      </section>

      <footer className="flex flex-wrap items-center gap-6 border-t border-foreground pt-6">
        {reviewed ? (
          <>
            <span className="text-label tabular-nums">
              reviewed {dayTime(entry.reviewedAt ?? 0)}
            </span>
            <button
              type="button"
              onClick={() => actions.reopen(entry.id)}
              className="border border-foreground px-4 py-2 text-sm hover:bg-foreground hover:text-background"
            >
              reopen entry
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={open > 0}
            onClick={() => actions.markReviewed(entry.id)}
            className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90 disabled:opacity-40"
          >
            {open > 0
              ? `mark reviewed · ${open} still open`
              : "mark reviewed →"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setDeleting(true)}
          className="text-label hover:text-foreground"
        >
          delete entry
        </button>
      </footer>

      <DeleteEntryDialog
        open={deleting}
        onOpenChange={setDeleting}
        tradeCount={trades.length}
        shotCount={entry.beforeShots.length + entry.afterShots.length}
        onConfirm={() => {
          go("/journal");
          actions.deleteEntry(entry.id);
        }}
      />
    </div>
  );
}

// ---------- /journal/setups ----------

function TriggerChips({
  triggers,
  onChange,
}: {
  triggers: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {triggers.map(trigger => (
        <span
          key={trigger}
          className="inline-flex items-center gap-1.5 border border-border px-2 py-0.5 text-sm"
        >
          {trigger}
          <button
            type="button"
            aria-label={`remove trigger ${trigger}`}
            onClick={() => onChange(triggers.filter(t => t !== trigger))}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        maxLength={80}
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const value = draft.trim();
          if (!value || triggers.includes(value)) return;
          onChange([...triggers, value]);
          setDraft("");
        }}
        placeholder="+ trigger, enter to add"
        className={cn(INPUT_CLASS, "w-56 placeholder:normal-case")}
      />
    </div>
  );
}

function SetupRowA({ setupId }: { setupId: number }) {
  const s = useJournal();
  const setup = s.setups.find(x => x.id === setupId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(setup?.name ?? "");
  const [error, setError] = useState<string | null>(null);
  if (!setup) return null;
  const usage = setupUsage(s, setup.id);

  if (!editing) {
    return (
      <li className="border-b border-border">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="w-full grid grid-cols-[12rem_1fr_auto] gap-x-6 items-baseline py-3 text-sm text-left hover:bg-foreground/[0.03]"
        >
          <span className="font-medium">{setup.name}</span>
          <span className="text-label truncate">
            {setup.triggers.length ? setup.triggers.join(" · ") : "no triggers"}
          </span>
          <span className="text-label tabular-nums">
            {usage === 1 ? "1 entry" : `${usage} entries`}
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className="border-b border-foreground py-6 space-y-6">
      <div className="flex items-baseline justify-between gap-4">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          onBlur={() => setError(actions.updateSetup(setup.id, { name }))}
          maxLength={60}
          aria-label="setup name"
          className={cn(INPUT_CLASS, "text-heading max-w-md")}
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-label hover:text-foreground"
        >
          done
        </button>
      </div>
      {error && <p className="text-label">{error}</p>}
      <div className="space-y-2">
        <span className="text-label block">entry triggers</span>
        <TriggerChips
          triggers={setup.triggers}
          onChange={triggers => actions.updateSetup(setup.id, { triggers })}
        />
      </div>
      <div className="space-y-2">
        <span className="text-label block">description</span>
        <RichField
          value={setup.description}
          editable
          onSave={description => actions.updateSetup(setup.id, { description })}
          placeholder="what the pattern looks like, where it works, where it fails"
        />
      </div>
      <div className="flex items-baseline gap-4">
        <button
          type="button"
          disabled={usage > 0}
          onClick={() => actions.deleteSetup(setup.id)}
          className="text-label hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground"
        >
          delete setup
        </button>
        {usage > 0 && (
          <span className="text-label">
            used by {usage === 1 ? "1 entry" : `${usage} entries`}; it stays
          </span>
        )}
      </div>
    </li>
  );
}

export function SetupsA() {
  const s = useJournal();
  const { href } = useJournalNav();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-12 max-w-3xl">
      <Link
        href={href("/journal")}
        className="text-label hover:text-foreground"
      >
        ← journal
      </Link>
      <header className="space-y-2">
        <h1 className="text-title">setups</h1>
        <p className="text-label">the patterns you trade, named once</p>
      </header>
      <form
        onSubmit={event => {
          event.preventDefault();
          const result = actions.createSetup(name);
          if (typeof result === "string") return setError(result);
          setName("");
          setError(null);
        }}
        className="space-y-2"
      >
        <div className="flex items-end gap-4">
          <input
            value={name}
            maxLength={60}
            onChange={event => setName(event.target.value)}
            placeholder="new setup name"
            aria-label="new setup name"
            className={cn(INPUT_CLASS, "max-w-sm placeholder:normal-case")}
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="text-label hover:text-foreground disabled:opacity-50 whitespace-nowrap pb-1.5"
          >
            add setup →
          </button>
        </div>
        {error && <p className="text-label">{error}</p>}
      </form>
      <section aria-labelledby="setups-label">
        <SectionHeader id="setups-label">
          setups · {s.setups.length}
        </SectionHeader>
        {s.setups.length === 0 ? (
          <p className="py-4 text-sm">no setups yet. name one above.</p>
        ) : (
          <ul>
            {s.setups.map(setup => (
              <SetupRowA key={setup.id} setupId={setup.id} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- trade detail ----------

export function TradeLinkA({ trade }: { trade: RealTrade }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const entry = entryForTrade(s, realTradeKey(trade.id));

  return (
    <p className="text-label mt-2">
      {entry ? (
        <Link
          href={href(`/journal/${entry.id}`)}
          className="hover:text-foreground"
        >
          journal · {entry.reviewedAt ? "reviewed" : "unreviewed"} entry →
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => go(`/journal?pick=${actions.importRealTrade(trade)}`)}
          className="hover:text-foreground"
        >
          not journaled · new journal entry →
        </button>
      )}
    </p>
  );
}

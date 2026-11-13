// PROTOTYPE (TASK-88). Variant C, "review queue": /journal opens on the
// number of entries waiting for a review, unjournaled trades are ticked on
// the same page to create an entry, and the entry page splits into a
// recording phase and a review phase. Actual R is the entry's hero numeral.
import { INPUT_CLASS, SELECT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type { Trade as RealTrade } from "@shared/types";
import { utc8Parts } from "@shared/time";
import { X } from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import {
  DeleteEntryDialog,
  Pnl,
  ProtoEditor,
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
  type Setup,
} from "./store";

type State = ReturnType<typeof useJournal>;

const ROW_CLASS =
  "grid grid-cols-[5.5rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border text-sm tabular-nums hover:bg-foreground/[0.03] transition-colors";

function setupNames(s: State, entry: JournalEntry): string {
  const names = entry.setupIds
    .map(id => s.setups.find(setup => setup.id === id)?.name)
    .filter((name): name is string => name !== undefined);
  return names.length === 0 ? "no setup" : names.join(", ");
}

function monthKey(ts: number): string {
  const p = utc8Parts(ts);
  return `${p.monthName.toLowerCase()} ${p.year}`;
}

// ---------- /journal ----------

function EntryRow({
  s,
  entry,
  trailing,
}: {
  s: State;
  entry: JournalEntry;
  trailing: React.ReactNode;
}) {
  const { href } = useJournalNav();
  const trades = tradesOf(s, entry);
  const otherAccount = entryAccountId(s, entry) !== CURRENT_ACCOUNT_ID;
  return (
    <li>
      <Link href={href(`/journal/${entry.id}`)} className={ROW_CLASS}>
        <span className="text-muted-foreground">
          {day(entryDate(s, entry))}
        </span>
        <span className="min-w-0">
          <span className="font-medium">
            {entrySymbol(s, entry).toLowerCase()}
          </span>{" "}
          {entrySides(s, entry).join("/")}
          <span className="text-label">
            {" "}
            · {plural(trades.length, "trade")} · {setupNames(s, entry)}
            {otherAccount &&
              ` · ${ACCOUNTS.find(a => a.id === entryAccountId(s, entry))?.name}`}
          </span>
        </span>
        <span className="flex items-baseline gap-6 justify-end">
          <Pnl value={netPnl(s, entry)} />
          <span className="text-label w-28 text-right">{trailing}</span>
        </span>
      </Link>
    </li>
  );
}

function Unjournaled() {
  const s = useJournal();
  const { go } = useJournalNav();
  const preselect = usePreselectedTrade();
  const picker = usePicker(preselect !== null ? [preselect] : []);
  const total = pickableTrades(s).length;

  useEffect(() => {
    if (preselect !== null) {
      document
        .getElementById("unjournaled")
        ?.scrollIntoView({ block: "start" });
    }
  }, [preselect]);

  const account = ACCOUNTS.find(a => a.id === CURRENT_ACCOUNT_ID)?.name;

  return (
    <section
      id="unjournaled"
      aria-labelledby="unjournaled-label"
      className="space-y-4 scroll-mt-8"
    >
      <SectionHeader id="unjournaled-label">
        unjournaled · {total} · binance {account}
      </SectionHeader>
      <div className="flex items-end gap-6">
        <input
          type="text"
          value={picker.query}
          onChange={event => picker.setQuery(event.target.value)}
          placeholder="filter by symbol"
          aria-label="filter trades by symbol"
          className={cn(INPUT_CLASS, "max-w-[14rem] placeholder:normal-case")}
        />
        {picker.lockedSymbol && (
          <p className="text-label pb-1.5">
            only {picker.lockedSymbol.toLowerCase()} trades can join this entry
          </p>
        )}
      </div>

      {picker.visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-2">
          {total === 0
            ? "every trade on this account is in a journal entry."
            : "no unjournaled trades match."}
        </p>
      ) : (
        <ul>
          {picker.visible.map(t => {
            const checked = picker.selected.includes(t.id);
            const disabled = !checked && picker.isDisabled(t);
            return (
              <li key={t.id}>
                <label
                  className={cn(
                    "grid grid-cols-[1.5rem_8rem_1fr_auto] gap-x-4 items-baseline py-2.5 border-b border-border text-sm tabular-nums cursor-pointer",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => picker.toggle(t.id)}
                    className="accent-foreground translate-y-0.5"
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
                    <Pnl value={t.realizedPnlUsd} />
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {picker.canCreate && picker.lockedSymbol && (
        <div className="flex items-baseline gap-6">
          <button
            type="button"
            onClick={() => go(`/journal/${picker.create()}`)}
            className="text-sm font-medium hover:underline underline-offset-4"
          >
            journal {picker.selected.length} {picker.lockedSymbol.toLowerCase()}{" "}
            {picker.selected.length === 1 ? "trade" : "trades"} →
          </button>
          <button
            type="button"
            onClick={() => picker.setSelected([])}
            className="text-label hover:text-foreground"
          >
            clear
          </button>
        </div>
      )}
    </section>
  );
}

export function ListC() {
  const s = useJournal();
  const { href } = useJournalNav();
  const entries = sortedEntries(s);
  const unreviewed = entries.filter(e => e.reviewedAt === null);
  const toReview = unreviewed.filter(e => openCount(s, e) === 0);
  const recording = unreviewed.filter(e => openCount(s, e) > 0);
  const reviewed = entries.filter(e => e.reviewedAt !== null);
  const byMonth = new Map<string, JournalEntry[]>();
  for (const entry of reviewed) {
    const key = monthKey(entryDate(s, entry));
    byMonth.set(key, [...(byMonth.get(key) ?? []), entry]);
  }

  return (
    <div className="space-y-14 max-w-4xl pb-24">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-title">journal</h1>
        <Link
          href={href("/journal/setups")}
          className="text-label hover:text-foreground"
        >
          setups →
        </Link>
      </header>

      <section aria-label="to review">
        <p className="text-display">{toReview.length}</p>
        <p className="text-label mt-3">
          {toReview.length === 0
            ? "nothing to review. every closed entry has been reviewed."
            : `${toReview.length === 1 ? "entry" : "entries"} to review · all trades closed`}
        </p>
      </section>

      {toReview.length > 0 && (
        <section aria-labelledby="to-review-label">
          <SectionHeader id="to-review-label">
            to review · {toReview.length}
          </SectionHeader>
          <ul>
            {toReview.map(entry => (
              <EntryRow
                key={entry.id}
                s={s}
                entry={entry}
                trailing={<span className="text-foreground">review →</span>}
              />
            ))}
          </ul>
        </section>
      )}

      {recording.length > 0 && (
        <section aria-labelledby="recording-label">
          <SectionHeader id="recording-label">
            recording · {recording.length}
          </SectionHeader>
          <ul>
            {recording.map(entry => (
              <EntryRow
                key={entry.id}
                s={s}
                entry={entry}
                trailing={`waiting for ${openCount(s, entry)} open`}
              />
            ))}
          </ul>
        </section>
      )}

      <Unjournaled />

      {byMonth.size === 0 ? (
        <section>
          <SectionHeader>reviewed</SectionHeader>
          <p className="py-4 text-sm text-muted-foreground">
            no reviewed entries yet.
          </p>
        </section>
      ) : (
        [...byMonth].map(([month, monthEntries]) => (
          <section key={month} aria-label={`reviewed ${month}`}>
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <h2 className="text-label">reviewed · {month}</h2>
              <Pnl
                value={monthEntries.reduce((sum, e) => sum + netPnl(s, e), 0)}
                className="text-label"
              />
            </div>
            <ul>
              {monthEntries.map(entry => (
                <EntryRow
                  key={entry.id}
                  s={s}
                  entry={entry}
                  trailing={fmtR(actualR(s, entry))}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

// ---------- /journal/:id ----------

function LinkedTrades({
  s,
  entry,
  editable,
}: {
  s: State;
  entry: JournalEntry;
  editable: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const trades = tradesOf(s, entry);
  const symbol = entrySymbol(s, entry);
  const candidates = pickableTrades(s).filter(t => t.symbol === symbol);

  return (
    <section aria-label="linked trades" className="space-y-1">
      <ul>
        {trades.map(t => (
          <li
            key={t.id}
            className="group grid grid-cols-[8rem_1fr_auto_1rem] gap-x-4 items-baseline py-2 border-b border-border text-sm tabular-nums"
          >
            <span className="text-muted-foreground">{dayTime(t.openTime)}</span>
            <span>{tradeLine(t)}</span>
            {t.status === "open" ? (
              <span className="text-label">open</span>
            ) : (
              <Pnl value={t.realizedPnlUsd} />
            )}
            {editable && trades.length > 1 ? (
              <button
                type="button"
                onClick={() =>
                  actions.setTrades(
                    entry.id,
                    entry.tradeIds.filter(id => id !== t.id)
                  )
                }
                aria-label={`remove trade #${t.id}`}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : (
              <span />
            )}
          </li>
        ))}
      </ul>
      {editable && (
        <div className="pt-2">
          {!adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="text-label hover:text-foreground"
            >
              + add trade
            </button>
          ) : (
            <div className="space-y-1">
              <p className="text-label">
                unjournaled {symbol.toLowerCase()} trades ·{" "}
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="hover:text-foreground"
                >
                  done
                </button>
              </p>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">
                  no other {symbol.toLowerCase()} trades to add.
                </p>
              ) : (
                <ul>
                  {candidates.map(t => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() =>
                          actions.setTrades(entry.id, [...entry.tradeIds, t.id])
                        }
                        className="w-full grid grid-cols-[8rem_1fr_auto] gap-x-4 items-baseline py-1.5 text-left text-sm tabular-nums text-muted-foreground hover:text-foreground"
                      >
                        <span>{dayTime(t.openTime)}</span>
                        <span>{tradeLine(t)}</span>
                        <span className="text-label">+ add</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SetupChips({
  s,
  entry,
  editable,
}: {
  s: State;
  entry: JournalEntry;
  editable: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const { href } = useJournalNav();

  if (!editable) {
    return (
      <p className="text-sm">
        {entry.setupIds.length === 0 ? "—" : setupNames(s, entry)}
      </p>
    );
  }

  const toggle = (id: number) =>
    actions.setSetups(
      entry.id,
      entry.setupIds.includes(id)
        ? entry.setupIds.filter(x => x !== id)
        : [...entry.setupIds, id]
    );

  const commit = () => {
    if (draft === null || draft.trim() === "") {
      setDraft(null);
      return;
    }
    const result = actions.createSetup(draft);
    if (typeof result === "string") {
      toast.error(result);
      return;
    }
    actions.setSetups(entry.id, [...entry.setupIds, result]);
    setDraft(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {s.setups.map(setup => {
        const on = entry.setupIds.includes(setup.id);
        return (
          <button
            key={setup.id}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(setup.id)}
            className={cn(
              "border px-2.5 py-1 text-xs transition-colors",
              on
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
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
          className="text-label hover:text-foreground px-1"
        >
          + new setup
        </button>
      ) : (
        <input
          autoFocus
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={event => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") setDraft(null);
          }}
          maxLength={60}
          placeholder="setup name"
          aria-label="new setup name"
          className={cn(INPUT_CLASS, "w-40 py-1 text-xs")}
        />
      )}
      <Link
        href={href("/journal/setups")}
        className="text-label hover:text-foreground px-1"
      >
        manage →
      </Link>
    </div>
  );
}

const PRICE_FIELDS: { field: PriceField; label: string }[] = [
  { field: "plannedEntry", label: "planned entry" },
  { field: "plannedStop", label: "stop loss" },
  { field: "plannedTarget", label: "take profit" },
];

function Block({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-label">{label}</h3>
      {children}
    </div>
  );
}

function RecordingPhase({
  s,
  entry,
  editable,
}: {
  s: State;
  entry: JournalEntry;
  editable: boolean;
}) {
  const rr = plannedRR(s, entry);
  const rich = (field: RichFieldName, label: string, placeholder: string) => (
    <Block label={label}>
      <RichField
        value={entry[field]}
        editable={editable}
        onSave={doc => actions.setRich(entry.id, field, doc)}
        placeholder={placeholder}
      />
    </Block>
  );

  return (
    <div className="space-y-10">
      <Block label="setups">
        <SetupChips s={s} entry={entry} editable={editable} />
      </Block>

      <Block label="planned prices">
        <div className="grid grid-cols-3 gap-6 max-w-xl">
          {PRICE_FIELDS.map(({ field, label }) => (
            <label key={field} className="space-y-1.5">
              <span className="text-label block">{label}</span>
              <input
                type="text"
                inputMode="decimal"
                value={entry[field]}
                disabled={!editable}
                onChange={event =>
                  actions.setPrice(entry.id, field, event.target.value.trim())
                }
                placeholder="—"
                className={cn(INPUT_CLASS, "tabular-nums disabled:opacity-100")}
              />
            </label>
          ))}
        </div>
        <p className="text-sm tabular-nums">
          planned r:r{" "}
          <span className="font-medium">
            {rr.kind === "ok" ? rr.value.toFixed(2) : "—"}
          </span>
          {rr.kind === "invalid" && (
            <span className="text-label"> · {rr.reason}</span>
          )}
        </p>
      </Block>

      <Block label="emotion">
        <select
          value={entry.emotion ?? ""}
          disabled={!editable}
          onChange={event =>
            actions.setEmotion(
              entry.id,
              event.target.value === "" ? null : (event.target.value as Emotion)
            )
          }
          aria-label="emotion"
          className={cn(SELECT_CLASS, "max-w-[14rem] disabled:opacity-100")}
        >
          <option value="">none</option>
          {EMOTIONS.map(emotion => (
            <option key={emotion} value={emotion}>
              {emotion}
            </option>
          ))}
        </select>
      </Block>

      {rich("entryReason", "entry reason", "why this trade, why now?")}
      {rich(
        "marketContext",
        "market context",
        "what was the market doing around the entry?"
      )}
      {rich(
        "invalidation",
        "invalidation",
        "what would have proven the idea wrong?"
      )}

      <Block label="before screenshots">
        <ShotSlot
          shots={entry.beforeShots}
          editable={editable}
          label="before"
          onAdd={src => actions.addShot(entry.id, "beforeShots", src)}
          onRemove={id => actions.removeShot(entry.id, "beforeShots", id)}
        />
      </Block>
    </div>
  );
}

function ReviewPhase({
  entry,
  open,
  editable,
}: {
  entry: JournalEntry;
  open: number;
  editable: boolean;
}) {
  const rich = (field: RichFieldName, label: string, placeholder: string) => (
    <Block label={label}>
      <RichField
        value={entry[field]}
        editable={editable}
        onSave={doc => actions.setRich(entry.id, field, doc)}
        placeholder={placeholder}
      />
    </Block>
  );

  const fields = (
    <div className="space-y-10">
      <Block label="after screenshots">
        <ShotSlot
          shots={entry.afterShots}
          editable={editable}
          label="after"
          onAdd={src => actions.addShot(entry.id, "afterShots", src)}
          onRemove={id => actions.removeShot(entry.id, "afterShots", id)}
        />
      </Block>
      {rich("mistakes", "mistakes", "what went wrong?")}
      {rich(
        "rulesFollowed",
        "rules followed or broken",
        "which rules held, which broke?"
      )}
      {rich(
        "managementDecisions",
        "management decisions",
        "stops moved, partials, exits"
      )}
      {rich(
        "notesForNext",
        "notes for next time",
        "what will you do differently?"
      )}
    </div>
  );

  if (open > 0) {
    return (
      <div className="space-y-8">
        <p className="text-sm">
          waiting for {plural(open, "open trade")} to close. the review opens
          when the last one does.
        </p>
        <div
          aria-disabled
          className="opacity-40 pointer-events-none select-none"
        >
          {fields}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <ReviewPrompts className="border-b border-border pb-8" />
      {fields}
    </div>
  );
}

export function EntryC({ entryId }: { entryId: number }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const entry = s.entries.find(e => e.id === entryId);
  const initialOpen = entry ? openCount(s, entry) : 0;
  const [phase, setPhase] = useState<"recording" | "review">(
    entry && entry.reviewedAt === null && initialOpen === 0
      ? "review"
      : "recording"
  );
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!entry) {
    return (
      <div className="space-y-4 max-w-3xl">
        <p className="text-title">journal entry not found</p>
        <Link href={href("/journal")} className="text-sm hover:underline">
          ← journal
        </Link>
      </div>
    );
  }

  const open = openCount(s, entry);
  const isReviewed = entry.reviewedAt !== null;
  const r = actualR(s, entry);
  const rr = plannedRR(s, entry);
  const pnl = netPnl(s, entry);
  const trades = tradesOf(s, entry);

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

      <header className="space-y-4">
        <p className="text-label">
          {entrySymbol(s, entry).toLowerCase()} {entrySides(s, entry).join("/")}{" "}
          · {dayTime(entryDate(s, entry))} ·{" "}
          {isReviewed ? "reviewed" : "unreviewed"}
        </p>
        {/* Not cn(): tailwind-merge drops text-display next to a text-* color. */}
        <p
          className={`text-display ${r.kind === "ok" ? pnlToneClass(r.value) : ""}`}
        >
          {fmtR(r)}
        </p>
        <p className="text-label tabular-nums">
          {open > 0
            ? `actual r · waiting for ${plural(open, "open trade")} to close`
            : r.kind === "invalid"
              ? `actual r · ${r.reason}`
              : r.kind === "empty"
                ? "actual r · needs planned entry and stop loss"
                : "actual r"}
        </p>
        <p className="text-sm tabular-nums flex flex-wrap gap-x-8 gap-y-1 pt-2">
          <span>
            <span className="text-label">planned r:r </span>
            {rr.kind === "ok" ? rr.value.toFixed(2) : "—"}
          </span>
          <span>
            <span className="text-label">net pnl </span>
            <Pnl value={pnl} />
          </span>
          <span>
            <span className="text-label">trades </span>
            {trades.length}
          </span>
        </p>
      </header>

      <LinkedTrades s={s} entry={entry} editable={!isReviewed} />

      <section aria-label="phase" className="space-y-10">
        <div
          role="tablist"
          aria-label="journal phase"
          className="flex border-b border-border"
        >
          {(["recording", "review"] as const).map(key => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={phase === key}
              onClick={() => setPhase(key)}
              className={cn(
                "px-0 mr-8 pb-3 -mb-px text-sm border-b transition-colors",
                phase === key
                  ? "border-foreground text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {key}
              {key === "review" && open > 0 && (
                <span className="text-label"> · locked</span>
              )}
            </button>
          ))}
        </div>

        {phase === "recording" ? (
          <RecordingPhase s={s} entry={entry} editable={!isReviewed} />
        ) : (
          <ReviewPhase
            entry={entry}
            open={open}
            editable={!isReviewed && open === 0}
          />
        )}
      </section>

      <footer className="border-t border-border pt-6 flex flex-wrap items-baseline justify-between gap-4">
        {isReviewed ? (
          <p className="text-sm">
            reviewed {dayTime(entry.reviewedAt ?? 0)} ·{" "}
            <button
              type="button"
              onClick={() => actions.reopen(entry.id)}
              className="underline underline-offset-4 hover:no-underline"
            >
              reopen
            </button>
          </p>
        ) : (
          <div className="flex items-baseline gap-4">
            <button
              type="button"
              disabled={open > 0}
              onClick={() => {
                actions.markReviewed(entry.id);
                setPhase("review");
              }}
              className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
            >
              mark reviewed →
            </button>
            {open > 0 && (
              <span className="text-label">
                waiting for {plural(open, "open trade")} to close
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="text-label hover:text-foreground"
        >
          delete entry
        </button>
      </footer>

      <DeleteEntryDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        tradeCount={trades.length}
        shotCount={entry.beforeShots.length + entry.afterShots.length}
        onConfirm={() => {
          actions.deleteEntry(entry.id);
          go("/journal");
        }}
      />
    </div>
  );
}

// ---------- /journal/setups ----------

function SetupEditor({ setup, usage }: { setup: Setup; usage: number }) {
  const [name, setName] = useState(setup.name);
  const [error, setError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");

  const commitName = () => {
    if (name === setup.name) return;
    const result = actions.updateSetup(setup.id, { name });
    setError(result);
    if (result !== null) setName(setup.name);
  };

  const addTrigger = () => {
    const clean = trigger.trim();
    if (clean.length < 1) return;
    if (clean.length > 80) {
      toast.error("a trigger is 1 to 80 characters");
      return;
    }
    actions.updateSetup(setup.id, { triggers: [...setup.triggers, clean] });
    setTrigger("");
  };

  return (
    <div className="space-y-6 py-6 pl-6 border-b border-border">
      <label className="block space-y-1.5">
        <span className="text-label block">name</span>
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          onBlur={commitName}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          maxLength={60}
          className={cn(INPUT_CLASS, "max-w-sm")}
        />
        {error && <span className="text-label block">{error}</span>}
      </label>

      <div className="space-y-2">
        <span className="text-label block">entry triggers</span>
        <div className="flex flex-wrap items-center gap-2">
          {setup.triggers.map((t, index) => (
            <span
              key={`${t}-${index}`}
              className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 text-xs"
            >
              {t}
              <button
                type="button"
                onClick={() =>
                  actions.updateSetup(setup.id, {
                    triggers: setup.triggers.filter((_, i) => i !== index),
                  })
                }
                aria-label={`remove trigger ${t}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            value={trigger}
            onChange={event => setTrigger(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                addTrigger();
              }
            }}
            maxLength={80}
            placeholder="+ trigger, enter to add"
            aria-label="new entry trigger"
            className={cn(
              INPUT_CLASS,
              "w-56 py-1 text-xs placeholder:normal-case"
            )}
          />
        </div>
      </div>

      <div className="space-y-2">
        <span className="text-label block">description</span>
        <ProtoEditor
          key={setup.id}
          content={setup.description}
          editable
          onSave={doc => actions.updateSetup(setup.id, { description: doc })}
          placeholder="what the pattern looks like and where it fails"
        />
      </div>

      <div className="flex items-baseline gap-4">
        <button
          type="button"
          disabled={usage > 0}
          onClick={() => actions.deleteSetup(setup.id)}
          className="text-label hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground"
        >
          delete setup
        </button>
        {usage > 0 && (
          <span className="text-label">
            used by {usage} {usage === 1 ? "entry" : "entries"} · can't be
            deleted
          </span>
        )}
      </div>
    </div>
  );
}

export function SetupsC() {
  const s = useJournal();
  const { href } = useJournalNav();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    const result = actions.createSetup(draft);
    if (typeof result === "string") {
      setError(result);
      return;
    }
    setError(null);
    setDraft("");
    setExpanded(result);
  };

  const setups = [...s.setups].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-12 max-w-4xl pb-24">
      <div className="space-y-6">
        <Link
          href={href("/journal")}
          className="text-label hover:text-foreground"
        >
          ← journal
        </Link>
        <header className="space-y-2">
          <h1 className="text-title">setups</h1>
          <p className="text-label">
            reusable patterns an entry can be tagged with
          </p>
        </header>
      </div>

      <section className="space-y-0">
        <form
          onSubmit={event => {
            event.preventDefault();
            create();
          }}
          className="flex items-end gap-4 pb-4 border-b border-border"
        >
          <input
            value={draft}
            onChange={event => {
              setDraft(event.target.value);
              setError(null);
            }}
            maxLength={60}
            placeholder="new setup name"
            aria-label="new setup name"
            className={cn(INPUT_CLASS, "max-w-sm placeholder:normal-case")}
          />
          <button
            type="submit"
            disabled={draft.trim() === ""}
            className="text-label hover:text-foreground disabled:opacity-50 pb-1.5 whitespace-nowrap"
          >
            add setup →
          </button>
          {error && <span className="text-label pb-1.5">{error}</span>}
        </form>

        <div className="grid grid-cols-[12rem_1fr_6rem] gap-x-6 text-label py-3 border-b border-border">
          <span>name</span>
          <span>entry triggers</span>
          <span className="text-right">entries</span>
        </div>

        {setups.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">
            no setups yet. name one above.
          </p>
        ) : (
          <ul>
            {setups.map(setup => {
              const usage = setupUsage(s, setup.id);
              const isOpen = expanded === setup.id;
              return (
                <li key={setup.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => setExpanded(isOpen ? null : setup.id)}
                    className={cn(
                      "w-full grid grid-cols-[12rem_1fr_6rem] gap-x-6 items-baseline py-3 border-b border-border text-left text-sm hover:bg-foreground/[0.03]",
                      isOpen && "font-medium"
                    )}
                  >
                    <span>{setup.name}</span>
                    <span className="flex flex-wrap gap-1.5">
                      {setup.triggers.length === 0 ? (
                        <span className="text-label">—</span>
                      ) : (
                        setup.triggers.map((t, i) => (
                          <span
                            key={`${t}-${i}`}
                            className="border border-border px-2 py-0.5 text-xs font-normal"
                          >
                            {t}
                          </span>
                        ))
                      )}
                    </span>
                    <span className="text-right tabular-nums">{usage}</span>
                  </button>
                  {isOpen && <SetupEditor setup={setup} usage={usage} />}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------- trade detail link ----------

export function TradeLinkC({ trade }: { trade: RealTrade }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const entry = entryForTrade(s, realTradeKey(trade.id));

  if (entry) {
    return (
      <Link
        href={href(`/journal/${entry.id}`)}
        className="text-label hover:text-foreground"
      >
        journal entry →
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={() => {
        const id = actions.importRealTrade(trade);
        go(`/journal?pick=${id}`);
      }}
      className="text-label hover:text-foreground"
    >
      + journal
    </button>
  );
}

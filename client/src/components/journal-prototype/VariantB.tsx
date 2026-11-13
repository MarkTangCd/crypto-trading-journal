// PROTOTYPE (TASK-88). Variant B "facing pages": the entry is an open
// notebook spread, recording on the left page, review on the right page.
// The list is a column table; setups are master-detail.
import { INPUT_CLASS, SELECT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type { Trade as RealTrade } from "@shared/types";
import { X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useSearch } from "wouter";
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
  type RichField as RichFieldKey,
} from "./store";

type JournalState = ReturnType<typeof useJournal>;

const entriesWord = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

function stateWord(s: JournalState, entry: JournalEntry): string {
  if (entry.reviewedAt !== null) return "reviewed";
  const open = openCount(s, entry);
  return open > 0 ? `${open} open` : "to review";
}

const LINK = "text-label hover:text-foreground transition-colors";
const TH = "text-label font-normal text-left py-3 pr-6 whitespace-nowrap";
const TD = "py-3 pr-6 align-baseline whitespace-nowrap";

// ---------- /journal ----------

export function ListB() {
  const s = useJournal();
  const { href } = useJournalNav();
  const params = new URLSearchParams(useSearch());
  const preselect = usePreselectedTrade();
  const [picking, setPicking] = useState(params.get("new") === "1");
  const entries = sortedEntries(s);

  return (
    <div className="space-y-12 max-w-5xl">
      <header className="flex items-baseline justify-between gap-6">
        <div className="space-y-2">
          <h1 className="text-title">journal</h1>
          <p className="text-label">
            {entriesWord(entries.length)} ·{" "}
            {entries.filter(e => stateWord(s, e) === "to review").length} to
            review
          </p>
        </div>
        <div className="flex items-baseline gap-6">
          <Link href={href("/journal/setups")} className={LINK}>
            setups
          </Link>
          {!picking && (
            <button
              type="button"
              onClick={() => setPicking(true)}
              className="text-sm hover:underline underline-offset-4"
            >
              new entry →
            </button>
          )}
        </div>
      </header>

      {picking ? (
        <PickerB
          preselect={preselect === null ? [] : [preselect]}
          onCancel={() => setPicking(false)}
        />
      ) : entries.length === 0 ? (
        <p className="text-sm border-t border-border pt-16">
          no journal entries yet. pick the trades of a position with{" "}
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="underline underline-offset-4"
          >
            new entry →
          </button>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={TH}>date</th>
                <th className={TH}>symbol</th>
                <th className={TH}>side</th>
                <th className={TH}>setups</th>
                <th className={cn(TH, "text-right")}>trades</th>
                <th className={cn(TH, "text-right")}>net pnl</th>
                <th className={cn(TH, "pr-0")}>state</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => {
                const word = stateWord(s, entry);
                const account = ACCOUNTS.find(
                  a => a.id === tradesOf(s, entry)[0]?.accountId
                );
                const setupNames = entry.setupIds
                  .map(id => s.setups.find(x => x.id === id)?.name)
                  .filter(Boolean)
                  .join(", ");
                return (
                  <tr
                    key={entry.id}
                    className="border-b border-border hover:bg-foreground/[0.03]"
                  >
                    <td className={TD}>
                      <Link
                        href={href(`/journal/${entry.id}`)}
                        className="hover:underline underline-offset-4"
                      >
                        {dayTime(entryDate(s, entry))}
                      </Link>
                    </td>
                    <td className={cn(TD, "font-medium")}>
                      {entrySymbol(s, entry).toLowerCase()}
                      {account && account.id !== CURRENT_ACCOUNT_ID && (
                        <span className="text-label"> · {account.name}</span>
                      )}
                    </td>
                    <td className={TD}>{entrySides(s, entry).join(" / ")}</td>
                    <td className={cn(TD, "whitespace-normal min-w-[10rem]")}>
                      {setupNames || <span className="text-label">—</span>}
                    </td>
                    <td className={cn(TD, "text-right")}>
                      {entry.tradeIds.length}
                    </td>
                    <td className={cn(TD, "text-right")}>
                      <Pnl value={netPnl(s, entry)} />
                    </td>
                    <td
                      className={cn(
                        TD,
                        "pr-0",
                        word === "reviewed"
                          ? "text-muted-foreground"
                          : "font-medium"
                      )}
                    >
                      {word === "reviewed" ? "reviewed" : `● ${word}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PickerB({
  preselect,
  onCancel,
}: {
  preselect: number[];
  onCancel: () => void;
}) {
  const picker = usePicker(preselect);
  const { go } = useJournalNav();
  const account = ACCOUNTS.find(a => a.id === CURRENT_ACCOUNT_ID);

  return (
    <section aria-labelledby="picker-label" className="space-y-6">
      <SectionHeader id="picker-label">
        pick the trades of this entry · binance {account?.name}
      </SectionHeader>
      <input
        type="text"
        value={picker.query}
        onChange={event => picker.setQuery(event.target.value.toUpperCase())}
        placeholder="search symbol"
        aria-label="search symbol"
        autoFocus
        className={cn(INPUT_CLASS, "max-w-xs placeholder:normal-case")}
      />
      {picker.lockedSymbol && (
        <p className="text-label">
          locked to {picker.lockedSymbol.toLowerCase()}: an entry holds one
          symbol. untick every trade to pick another.
        </p>
      )}
      {picker.visible.length === 0 ? (
        <p className="text-sm py-6">
          {picker.query
            ? "no unlinked trades match this symbol."
            : "every trade in this account is already in an entry."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className={cn(TH, "w-8")}>
                  <span className="sr-only">pick</span>
                </th>
                <th className={TH}>opened</th>
                <th className={TH}>symbol</th>
                <th className={TH}>status</th>
                <th className={TH}>position</th>
                <th className={cn(TH, "text-right pr-0")}>pnl</th>
              </tr>
            </thead>
            <tbody>
              {picker.visible.map(t => {
                const disabled = picker.isDisabled(t);
                const checked = picker.selected.includes(t.id);
                return (
                  <tr
                    key={t.id}
                    className={cn(
                      "border-b border-border",
                      disabled ? "opacity-35" : "hover:bg-foreground/[0.03]",
                      checked && "bg-foreground/[0.05]"
                    )}
                  >
                    <td className={TD}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => picker.toggle(t.id)}
                        aria-label={`pick ${t.symbol} ${t.side} opened ${dayTime(t.openTime)}`}
                        className="accent-foreground h-4 w-4 align-middle"
                      />
                    </td>
                    <td className={TD}>{dayTime(t.openTime)}</td>
                    <td className={cn(TD, "font-medium")}>
                      {t.symbol.toLowerCase()}
                    </td>
                    <td className={TD}>{t.status}</td>
                    <td className={TD}>{tradeLine(t)}</td>
                    <td className={cn(TD, "text-right pr-0")}>
                      {t.status === "open" ? (
                        <span className="text-label">open</span>
                      ) : (
                        <Pnl value={t.realizedPnlUsd} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-baseline gap-8 border-t border-border pt-4">
        <button
          type="button"
          disabled={!picker.canCreate}
          onClick={() => go(`/journal/${picker.create()}`)}
          className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
        >
          {picker.canCreate
            ? `create entry with ${plural(picker.selected.length, "trade")} →`
            : "tick at least one trade"}
        </button>
        <button type="button" onClick={onCancel} className={LINK}>
          cancel
        </button>
      </div>
    </section>
  );
}

// ---------- /journal/:id ----------

const PRICE_FIELDS: { key: PriceField; label: string }[] = [
  { key: "plannedEntry", label: "planned entry" },
  { key: "plannedStop", label: "stop loss" },
  { key: "plannedTarget", label: "take profit" },
];

const REVIEW_FIELDS: { key: RichFieldKey; label: string; hint: string }[] = [
  { key: "mistakes", label: "mistakes", hint: "what went wrong?" },
  {
    key: "rulesFollowed",
    label: "rules followed or broken",
    hint: "which rules held, which broke?",
  },
  {
    key: "managementDecisions",
    label: "management decisions",
    hint: "stops moved, partials, adds, exits",
  },
  {
    key: "notesForNext",
    label: "notes for next time",
    hint: "what will you do differently?",
  },
];

function PageLabel({ children }: { children: string }) {
  return <p className="text-label">{children}</p>;
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-label border-b border-border pb-2">{label}</h3>
      {children}
    </section>
  );
}

export function EntryB({ entryId }: { entryId: number }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const [deleting, setDeleting] = useState(false);
  const entry = s.entries.find(e => e.id === entryId);

  if (!entry) {
    return (
      <div className="space-y-4 max-w-3xl">
        <p className="text-title">journal entry not found</p>
        <Link href={href("/journal")} className={LINK}>
          ← journal
        </Link>
      </div>
    );
  }

  const trades = tradesOf(s, entry);
  const open = openCount(s, entry);
  const reviewed = entry.reviewedAt !== null;
  const recordingEditable = !reviewed;
  const reviewEditable = !reviewed && open === 0;
  const planned = plannedRR(s, entry);
  const actual = actualR(s, entry);
  const sides = entrySides(s, entry);

  return (
    <div className="space-y-10 max-w-6xl pb-24">
      <div className="flex items-baseline justify-between gap-4">
        <Link href={href("/journal")} className={LINK}>
          ← journal
        </Link>
        <span className="text-label tabular-nums" aria-live="polite">
          saved {hhmm(entry.updatedAt)}
        </span>
      </div>

      <header className="flex flex-wrap items-baseline gap-x-6 gap-y-2 border-b border-border pb-4">
        <h1 className="text-title">{entrySymbol(s, entry)}</h1>
        <p className="text-label tabular-nums">
          {dayTime(entryDate(s, entry))} · {sides.join(" / ")} ·{" "}
          {plural(trades.length, "trade")} · {stateWord(s, entry)}
        </p>
      </header>

      <div className="grid lg:grid-cols-2 gap-y-16">
        {/* left page: before */}
        <div className="space-y-10 lg:pr-12 lg:border-r lg:border-border">
          <div className="space-y-2">
            <PageLabel>before · planned r:r</PageLabel>
            <p className="text-display">
              {planned.kind === "ok" ? planned.value.toFixed(2) : "—"}
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
                  value={entry[field.key]}
                  disabled={!recordingEditable}
                  onChange={event =>
                    actions.setPrice(entry.id, field.key, event.target.value)
                  }
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
            <SetupSelect entry={entry} editable={recordingEditable} />
            <label className="space-y-2 block">
              <span className="text-label block">emotion</span>
              <select
                value={entry.emotion ?? ""}
                disabled={!recordingEditable}
                onChange={event =>
                  actions.setEmotion(
                    entry.id,
                    event.target.value === ""
                      ? null
                      : (event.target.value as Emotion)
                  )
                }
                className={cn(
                  SELECT_CLASS,
                  "disabled:border-transparent disabled:cursor-default"
                )}
              >
                <option value="">—</option>
                {EMOTIONS.map(emotion => (
                  <option key={emotion} value={emotion}>
                    {emotion}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <Block label="entry reason">
            <RichField
              value={entry.entryReason}
              editable={recordingEditable}
              onSave={v => actions.setRich(entry.id, "entryReason", v)}
              placeholder="why this trade, why now?"
            />
          </Block>
          <Block label="market context">
            <RichField
              value={entry.marketContext}
              editable={recordingEditable}
              onSave={v => actions.setRich(entry.id, "marketContext", v)}
              placeholder="what is the market doing?"
            />
          </Block>
          <Block label="invalidation">
            <RichField
              value={entry.invalidation}
              editable={recordingEditable}
              onSave={v => actions.setRich(entry.id, "invalidation", v)}
              placeholder="what proves the idea wrong?"
            />
          </Block>
          <Block label="before screenshots">
            <ShotSlot
              shots={entry.beforeShots}
              editable={recordingEditable}
              onAdd={src => actions.addShot(entry.id, "beforeShots", src)}
              onRemove={id => actions.removeShot(entry.id, "beforeShots", id)}
              label="before"
            />
          </Block>
        </div>

        {/* right page: after */}
        <div className="space-y-10 lg:pl-12">
          <div className="space-y-2">
            <PageLabel>after · actual r</PageLabel>
            {/* Not cn(): tailwind-merge drops text-display next to a color. */}
            <p
              className={`text-display ${actual.kind === "ok" ? pnlToneClass(actual.value) : ""}`}
            >
              {open > 0 ? "open" : fmtR(actual)}
            </p>
            <p className="text-label tabular-nums">
              net <Pnl value={netPnl(s, entry)} />
              {open > 0
                ? ` · ${open} of ${trades.length} trades still open`
                : actual.kind === "empty"
                  ? " · set entry and stop to measure r"
                  : actual.kind === "invalid"
                    ? ` · ${actual.reason}`
                    : " · pnl / (|entry − stop| × qty)"}
            </p>
          </div>

          <LinkedTrades entry={entry} editable={!reviewed} />

          {open > 0 ? (
            <div className="space-y-6">
              <p className="text-sm border-y border-border py-4">
                waiting for {plural(open, "open trade")} to close. the review
                opens once binance reports every linked trade closed.
              </p>
              <div className="space-y-6 opacity-35 select-none" aria-hidden>
                {["after screenshots", ...REVIEW_FIELDS.map(f => f.label)].map(
                  label => (
                    <section key={label} className="space-y-3">
                      <h3 className="text-label border-b border-border pb-2">
                        {label}
                      </h3>
                      <p className="text-sm">locked</p>
                    </section>
                  )
                )}
              </div>
            </div>
          ) : (
            <>
              <ReviewPrompts className="border-y border-border py-5" />
              <Block label="after screenshots">
                <ShotSlot
                  shots={entry.afterShots}
                  editable={reviewEditable}
                  onAdd={src => actions.addShot(entry.id, "afterShots", src)}
                  onRemove={id =>
                    actions.removeShot(entry.id, "afterShots", id)
                  }
                  label="after"
                />
              </Block>
              {REVIEW_FIELDS.map(field => (
                <Block key={field.key} label={field.label}>
                  <RichField
                    value={entry[field.key]}
                    editable={reviewEditable}
                    onSave={v => actions.setRich(entry.id, field.key, v)}
                    placeholder={field.hint}
                  />
                </Block>
              ))}
            </>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-baseline justify-between gap-6 border-t border-border pt-6">
        {reviewed ? (
          <p className="text-sm tabular-nums">
            reviewed {dayTime(entry.reviewedAt ?? 0)} ·{" "}
            <button
              type="button"
              onClick={() => actions.reopen(entry.id)}
              className="underline underline-offset-4"
            >
              reopen
            </button>
          </p>
        ) : (
          <div className="flex items-baseline gap-4">
            <button
              type="button"
              disabled={open > 0}
              onClick={() => actions.markReviewed(entry.id)}
              className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
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

      <DeleteEntryDialog
        open={deleting}
        onOpenChange={setDeleting}
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

function SetupSelect({
  entry,
  editable,
}: {
  entry: JournalEntry;
  editable: boolean;
}) {
  const s = useJournal();
  const { href } = useJournalNav();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const names = entry.setupIds
    .map(id => s.setups.find(x => x.id === id)?.name)
    .filter(Boolean);

  const toggle = (id: number) =>
    actions.setSetups(
      entry.id,
      entry.setupIds.includes(id)
        ? entry.setupIds.filter(x => x !== id)
        : [...entry.setupIds, id]
    );

  return (
    <div className="space-y-2 relative">
      <span className="text-label block">setups</span>
      {editable ? (
        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          className={cn(INPUT_CLASS, "text-left")}
        >
          {names.length > 0 ? names.join(", ") : "—"}
        </button>
      ) : (
        <p className="text-sm py-1.5">{names.join(", ") || "—"}</p>
      )}
      {open && editable && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-background border border-border p-3 space-y-2">
          <ul className="space-y-1">
            {s.setups.map(setup => (
              <li key={setup.id}>
                <label className="flex items-center gap-3 text-sm cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={entry.setupIds.includes(setup.id)}
                    onChange={() => toggle(setup.id)}
                    className="accent-foreground h-4 w-4"
                  />
                  {setup.name}
                </label>
              </li>
            ))}
          </ul>
          <form
            className="border-t border-border pt-2"
            onSubmit={event => {
              event.preventDefault();
              const result = actions.createSetup(draft);
              if (typeof result === "string") {
                setError(result);
                return;
              }
              actions.setSetups(entry.id, [...entry.setupIds, result]);
              setDraft("");
              setError(null);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="+ new setup"
              aria-label="new setup name"
              className={cn(INPUT_CLASS, "border-transparent")}
            />
            {error && <p className="text-label pt-1">{error}</p>}
          </form>
          <div className="flex justify-between pt-1">
            <Link href={href("/journal/setups")} className={LINK}>
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
        </div>
      )}
    </div>
  );
}

function LinkedTrades({
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
    <section className="space-y-2">
      <h3 className="text-label border-b border-border pb-2">
        linked trades · {trades.length}
      </h3>
      <ul className="text-sm tabular-nums">
        {trades.map(t => (
          <li
            key={t.id}
            className="grid grid-cols-[7.5rem_1fr_auto_auto] gap-x-4 items-baseline py-2 border-b border-border group"
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
                aria-label={`unlink trade opened ${dayTime(t.openTime)}`}
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
            {addable.length === 0 ? (
              <p className="text-label">
                no unlinked {symbol.toLowerCase()} trades in this account.
              </p>
            ) : (
              <ul className="text-sm tabular-nums">
                {addable.map(t => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => {
                        actions.setTrades(entry.id, [...entry.tradeIds, t.id]);
                        setAdding(false);
                      }}
                      className="w-full grid grid-cols-[7.5rem_1fr_auto] gap-x-4 items-baseline py-2 text-left hover:bg-foreground/[0.03]"
                    >
                      <span className="text-muted-foreground">
                        {dayTime(t.openTime)}
                      </span>
                      <span>+ {tradeLine(t)}</span>
                      <span className="text-label">{t.status}</span>
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

// ---------- /journal/setups ----------

export function SetupsB() {
  const s = useJournal();
  const { href } = useJournalNav();
  const [selectedId, setSelectedId] = useState<number | null>(
    s.setups[0]?.id ?? null
  );
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selected = s.setups.find(x => x.id === selectedId) ?? null;

  return (
    <div className="space-y-10 max-w-5xl pb-24">
      <div className="space-y-2">
        <Link href={href("/journal")} className={LINK}>
          ← journal
        </Link>
        <h1 className="text-title">setups</h1>
        <p className="text-label">reusable patterns an entry is tagged with</p>
      </div>

      <div className="grid md:grid-cols-[16rem_1fr] gap-y-10">
        <div className="space-y-4 md:pr-8 md:border-r md:border-border">
          <form
            onSubmit={event => {
              event.preventDefault();
              const result = actions.createSetup(draft);
              if (typeof result === "string") {
                setError(result);
                return;
              }
              setSelectedId(result);
              setDraft("");
              setError(null);
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="new setup name ⏎"
              aria-label="new setup name"
              maxLength={60}
              className={cn(INPUT_CLASS, "placeholder:normal-case")}
            />
            {error && <p className="text-label pt-1">{error}</p>}
          </form>
          {s.setups.length === 0 ? (
            <p className="text-sm">no setups yet. name one above.</p>
          ) : (
            <ul className="text-sm">
              {s.setups.map(setup => (
                <li key={setup.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(setup.id)}
                    aria-current={setup.id === selectedId}
                    className={cn(
                      "w-full flex items-baseline justify-between gap-3 py-2 border-b border-border text-left hover:underline underline-offset-4",
                      setup.id === selectedId && "font-medium"
                    )}
                  >
                    <span>
                      {setup.id === selectedId ? "▸ " : ""}
                      {setup.name}
                    </span>
                    <span className="text-label tabular-nums">
                      {setupUsage(s, setup.id)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="md:pl-10">
          {selected ? (
            <SetupEditorB key={selected.id} setupId={selected.id} />
          ) : (
            <p className="text-sm text-muted-foreground">
              pick a setup on the left, or name a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupEditorB({ setupId }: { setupId: number }) {
  const s = useJournal();
  const setup = s.setups.find(x => x.id === setupId);
  const [name, setName] = useState(setup?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  if (!setup) return null;
  const usage = setupUsage(s, setup.id);

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={event => setName(event.target.value)}
          onBlur={() => setNameError(actions.updateSetup(setup.id, { name }))}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="setup name"
          maxLength={60}
          className="text-heading w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none px-0"
        />
        <p className="text-label tabular-nums">
          {nameError ?? `used by ${entriesWord(usage)}`}
        </p>
      </div>

      <Block label="entry triggers">
        <ul className="flex flex-wrap gap-2">
          {setup.triggers.map(t => (
            <li
              key={t}
              className="inline-flex items-center gap-2 border border-border px-2 py-1 text-sm"
            >
              {t}
              <button
                type="button"
                onClick={() =>
                  actions.updateSetup(setup.id, {
                    triggers: setup.triggers.filter(x => x !== t),
                  })
                }
                aria-label={`remove trigger ${t}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          <li>
            <input
              type="text"
              value={trigger}
              onChange={event => setTrigger(event.target.value)}
              onKeyDown={event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const clean = trigger.trim();
                if (clean.length < 1 || clean.length > 80) {
                  setTriggerError("a trigger is 1 to 80 characters");
                  return;
                }
                if (!setup.triggers.includes(clean)) {
                  actions.updateSetup(setup.id, {
                    triggers: [...setup.triggers, clean],
                  });
                }
                setTrigger("");
                setTriggerError(null);
              }}
              placeholder="+ trigger ⏎"
              aria-label="new entry trigger"
              maxLength={80}
              className={cn(INPUT_CLASS, "w-48 py-1")}
            />
          </li>
        </ul>
        {triggerError && <p className="text-label">{triggerError}</p>}
      </Block>

      <Block label="description">
        <RichField
          value={setup.description}
          editable
          onSave={v => actions.updateSetup(setup.id, { description: v })}
          placeholder="what does the pattern look like? paste a chart."
        />
      </Block>

      <div className="flex items-baseline gap-4 border-t border-border pt-6">
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
            used by {entriesWord(usage)}; untag them first
          </span>
        )}
      </div>
    </div>
  );
}

// ---------- trade detail ----------

export function TradeLinkB({ trade }: { trade: RealTrade }) {
  const s = useJournal();
  const { href, go } = useJournalNav();
  const entry = entryForTrade(s, realTradeKey(trade.id));

  return (
    <section
      aria-labelledby="trade-journal-label"
      className="space-y-2 max-w-3xl"
    >
      <SectionHeader id="trade-journal-label">journal</SectionHeader>
      {entry ? (
        <Link
          href={href(`/journal/${entry.id}`)}
          className="grid grid-cols-[7.5rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border text-sm tabular-nums hover:underline underline-offset-4"
        >
          <span>{day(entryDate(s, entry))}</span>
          <span>
            {entry.setupIds
              .map(id => s.setups.find(x => x.id === id)?.name)
              .filter(Boolean)
              .join(", ") || "no setup"}{" "}
            <span className="text-label">
              · {plural(entry.tradeIds.length, "trade")} · {stateWord(s, entry)}
            </span>
          </span>
          <span aria-hidden>→</span>
        </Link>
      ) : (
        <div className="flex items-baseline justify-between gap-6 py-3">
          <p className="text-sm text-muted-foreground">
            this trade is not in a journal entry.
          </p>
          <button
            type="button"
            onClick={() => {
              const id = actions.importRealTrade(trade);
              go(`/journal?new=1&pick=${id}`);
            }}
            className="text-sm hover:underline underline-offset-4 whitespace-nowrap"
          >
            new journal entry →
          </button>
        </div>
      )}
    </section>
  );
}

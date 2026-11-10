// PROTOTYPE (TASK-72) · Variant A "ledger".
// One column, read top to bottom like the Trades ledger. Symbol is the hero.
// Scenarios in creation order. Close is an inline section at the foot of the
// page, not a modal.
import { INPUT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { Link } from "wouter";
import { ObservationComposer } from "./ObservationComposer";
import { PlanEditor } from "./PlanEditor";
import {
  DeletePlanDialog,
  OutcomeGlyphs,
  SavedMark,
  Segmented,
  VerdictToggle,
  dayTime,
  groupByCloseDay,
  hhmm,
  openFor,
  usePlansNav,
} from "./shared";
import {
  SCENARIO_TIME_FRAMES,
  SYMBOL_SUGGESTIONS,
  closedPlans,
  initialVerdicts,
  openPlans,
  outcomeTally,
  planStore,
  usePlan,
  usePlans,
  type Outcome,
  type Plan,
  type Scenario,
  type ScenarioTimeFrame,
  type Side,
} from "./store";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

export function ListA() {
  const plans = usePlans();
  const { href, go } = usePlansNav();
  const [symbol, setSymbol] = useState("");
  const open = openPlans(plans);
  const closedByDay = groupByCloseDay(closedPlans(plans));

  const create = () => {
    if (!symbol.trim()) return;
    go(`/plans/${planStore.create(symbol)}`);
  };

  return (
    <div className="space-y-12 max-w-3xl">
      <header className="space-y-2">
        <p className="text-title">plans</p>
        <p className="text-label">
          scenarios written before the market decides
        </p>
      </header>

      <form
        onSubmit={event => {
          event.preventDefault();
          create();
        }}
        className="flex items-end gap-4"
      >
        <input
          value={symbol}
          onChange={event => setSymbol(event.target.value.toUpperCase())}
          list="plan-symbols-a"
          placeholder="symbol, e.g. BTCUSDT"
          aria-label="symbol for a new plan"
          className={cn(INPUT_CLASS, "uppercase placeholder:normal-case")}
        />
        <datalist id="plan-symbols-a">
          {SYMBOL_SUGGESTIONS.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={!symbol.trim()}
          className="text-label hover:text-foreground disabled:opacity-50 whitespace-nowrap pb-1.5"
        >
          open plan →
        </button>
      </form>

      <section aria-labelledby="a-open">
        <SectionHeader id="a-open">open · {open.length}</SectionHeader>
        {open.length === 0 ? (
          <p className="py-4 text-sm">
            no open plans. type a symbol above to write one.
          </p>
        ) : (
          <ul>
            {open.map(p => (
              <li key={p.id}>
                <Link
                  href={href(`/plans/${p.id}`)}
                  className="grid grid-cols-[7rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border text-sm hover:underline"
                >
                  <span className="tabular-nums">{openFor(p)}</span>
                  <span>
                    <span className="font-medium">
                      {p.symbol.toLowerCase()}
                    </span>
                    <span className="text-label">
                      {" "}
                      · {p.scenarios.length} scenarios · {p.observations.length}{" "}
                      observations
                    </span>
                  </span>
                  <span aria-hidden>→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {closedByDay.map(([day, dayPlans]) => (
        <section key={day} aria-label={`closed ${day}`}>
          <SectionHeader>closed · {day}</SectionHeader>
          <ul>
            {dayPlans.map(p => {
              const tally = outcomeTally(p);
              return (
                <li key={p.id}>
                  <Link
                    href={href(`/plans/${p.id}`)}
                    className="grid grid-cols-[7rem_1fr_auto] gap-x-6 items-baseline py-3 border-b border-border text-sm hover:underline"
                  >
                    <span className="tabular-nums">
                      {hhmm(p.closedAt ?? 0)}
                    </span>
                    <span>
                      <span className="font-medium">
                        {p.symbol.toLowerCase()}
                      </span>{" "}
                      <OutcomeGlyphs plan={p} />
                    </span>
                    <span className="text-label tabular-nums">
                      {p.scenarios.length === 0
                        ? "—"
                        : `${tally.triggered} triggered · ${tally.invalidated} invalidated`}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DetailA({ planId }: { planId: number }) {
  const plan = usePlan(planId);
  const { href, go } = usePlansNav();
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!plan) {
    return (
      <div className="space-y-4">
        <p className="text-title">plan not found</p>
        <Link href={href("/plans")} className="text-sm hover:underline">
          ← plans
        </Link>
      </div>
    );
  }
  const isOpen = plan.closedAt === null;

  return (
    <div className="space-y-12 max-w-3xl pb-24">
      <div className="flex items-baseline justify-between gap-4">
        <Link
          href={href("/plans")}
          className="text-label hover:text-foreground"
        >
          ← plans
        </Link>
        <SavedMark ts={plan.updatedAt} />
      </div>

      <header className="space-y-3">
        <SymbolInput plan={plan} />
        <p className="text-label">
          {isOpen
            ? `open · since ${dayTime(plan.createdAt)} · ${openFor(plan)}`
            : `closed ${dayTime(plan.closedAt ?? 0)} · was open ${openFor(plan)}`}
        </p>
      </header>

      <section aria-labelledby="a-context" className="space-y-4">
        <SectionHeader id="a-context">market context</SectionHeader>
        <PlanEditor
          content={plan.marketContext}
          editable={isOpen}
          onSave={json => planStore.setMarketContext(plan.id, json)}
          placeholder="what is the market doing, and why does this symbol matter now?"
        />
      </section>

      <section aria-labelledby="a-scenarios" className="space-y-2">
        <SectionHeader id="a-scenarios">
          scenarios · {plan.scenarios.length}
        </SectionHeader>
        {plan.scenarios.length === 0 && !isOpen && (
          <p className="py-4 text-sm">no scenarios were written.</p>
        )}
        <ol>
          {plan.scenarios.map((s, i) => (
            <ScenarioA
              key={s.id}
              plan={plan}
              scenario={s}
              letter={LETTERS[i]}
              editable={isOpen && !closing}
            />
          ))}
        </ol>
        {isOpen && !closing && <AddScenarioA planId={plan.id} />}
      </section>

      <section aria-labelledby="a-obs" className="space-y-4">
        <SectionHeader id="a-obs">
          observations · {plan.observations.length}
        </SectionHeader>
        {plan.observations.length === 0 && (
          <p className="text-sm">
            {isOpen
              ? "nothing logged yet. log what you see as it happens."
              : "nothing was logged."}
          </p>
        )}
        <ul>
          {plan.observations.map(o => (
            <li
              key={o.id}
              className="group grid grid-cols-[7rem_1fr_auto] gap-x-6 py-3 border-b border-border"
            >
              <span className="text-sm tabular-nums pt-px">
                {dayTime(o.createdAt)}
              </span>
              <PlanEditor
                content={o.content}
                editable={isOpen}
                onSave={json =>
                  planStore.updateObservation(plan.id, o.id, json)
                }
              />
              {isOpen ? (
                <button
                  type="button"
                  onClick={() => planStore.deleteObservation(plan.id, o.id)}
                  className="text-label hover:text-foreground opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  del
                </button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
        {isOpen && <ObservationComposer planId={plan.id} />}
      </section>

      {closing ? (
        <ClosePanelA plan={plan} onCancel={() => setClosing(false)} />
      ) : (
        <footer className="flex items-center gap-6 border-t border-foreground pt-6">
          {isOpen ? (
            <button
              type="button"
              onClick={() =>
                plan.scenarios.length === 0
                  ? planStore.close(plan.id, {})
                  : setClosing(true)
              }
              className="bg-foreground text-background px-4 py-2 text-sm hover:opacity-90"
            >
              close plan →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => planStore.reopen(plan.id)}
              className="border border-foreground px-4 py-2 text-sm hover:bg-foreground hover:text-background"
            >
              reopen plan
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-label hover:text-foreground"
          >
            delete plan
          </button>
        </footer>
      )}

      <DeletePlanDialog
        plan={deleting ? plan : null}
        onCancel={() => setDeleting(false)}
        onConfirm={() => {
          planStore.delete(plan.id);
          go("/plans");
        }}
      />
    </div>
  );
}

function SymbolInput({ plan }: { plan: Plan }) {
  const [draft, setDraft] = useState(plan.symbol);
  const isOpen = plan.closedAt === null;
  if (!isOpen) return <h1 className="text-display">{plan.symbol}</h1>;
  return (
    <input
      value={draft}
      onChange={event => setDraft(event.target.value.toUpperCase())}
      onBlur={() =>
        draft.trim()
          ? planStore.setSymbol(plan.id, draft)
          : setDraft(plan.symbol)
      }
      list="plan-symbols-a"
      aria-label="symbol"
      className="text-display w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none px-0 uppercase"
    />
  );
}

function ScenarioA({
  plan,
  scenario,
  letter,
  editable,
}: {
  plan: Plan;
  scenario: Scenario;
  letter: string;
  editable: boolean;
}) {
  const [name, setName] = useState(scenario.name);
  const update = (patch: Partial<Scenario>) =>
    planStore.updateScenario(plan.id, scenario.id, patch);
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-x-4 py-5 border-b border-border">
      <span className="text-heading leading-none pt-0.5" aria-hidden>
        {letter}
      </span>
      <div className="space-y-3 min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          {editable ? (
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              onBlur={() =>
                name.trim()
                  ? update({ name: name.trim() })
                  : setName(scenario.name)
              }
              aria-label="scenario name"
              className="flex-1 min-w-[12rem] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none text-base font-medium px-0"
            />
          ) : (
            <span className="flex-1 text-base font-medium">
              {scenario.name}
            </span>
          )}
          {scenario.outcome && plan.closedAt !== null && (
            <span className="text-sm font-medium">
              {scenario.outcome === "triggered"
                ? "● triggered"
                : "○ invalidated"}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented<Side>
            options={["long", "short"]}
            value={scenario.side}
            onChange={side => update({ side })}
            label="side"
            disabled={!editable}
          />
          <Segmented<ScenarioTimeFrame>
            options={SCENARIO_TIME_FRAMES}
            value={scenario.primaryTimeFrame}
            onChange={primaryTimeFrame => update({ primaryTimeFrame })}
            label="primary timeframe"
            disabled={!editable}
          />
          {editable && (
            <button
              type="button"
              onClick={() => planStore.deleteScenario(plan.id, scenario.id)}
              className="text-label hover:text-foreground ml-auto"
            >
              del
            </button>
          )}
        </div>
        <PlanEditor
          content={scenario.content}
          editable={editable}
          onSave={json => update({ content: json })}
          placeholder="trigger, entry, stop, target. paste a chart if it helps."
        />
      </div>
    </li>
  );
}

function AddScenarioA({ planId }: { planId: number }) {
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [tf, setTf] = useState<ScenarioTimeFrame>("1H");
  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        if (!name.trim()) return;
        planStore.addScenario(planId, {
          name: name.trim(),
          side,
          primaryTimeFrame: tf,
        });
        setName("");
      }}
      className="grid grid-cols-[2rem_1fr] gap-x-4 pt-4"
    >
      <span className="text-heading leading-none opacity-30" aria-hidden>
        +
      </span>
      <div className="space-y-3">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          placeholder="new scenario, e.g. range high reclaim"
          aria-label="new scenario name"
          className={INPUT_CLASS}
        />
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Segmented<Side>
            options={["long", "short"]}
            value={side}
            onChange={setSide}
            label="new scenario side"
          />
          <Segmented<ScenarioTimeFrame>
            options={SCENARIO_TIME_FRAMES}
            value={tf}
            onChange={setTf}
            label="new scenario primary timeframe"
          />
          <button
            type="submit"
            disabled={!name.trim()}
            className="text-label hover:text-foreground disabled:opacity-50 ml-auto"
          >
            add scenario →
          </button>
        </div>
      </div>
    </form>
  );
}

function ClosePanelA({ plan, onCancel }: { plan: Plan; onCancel: () => void }) {
  const [verdicts, setVerdicts] = useState<Record<number, Outcome>>(() =>
    initialVerdicts(plan)
  );
  const done = plan.scenarios.filter(s => verdicts[s.id]).length;
  const ready = done === plan.scenarios.length;
  return (
    <section
      aria-labelledby="a-close"
      className="space-y-4 border-t border-foreground pt-6"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="a-close" className="text-base font-medium">
          close the plan
        </h2>
        <span className="text-label tabular-nums">
          {done} of {plan.scenarios.length} verdicts
        </span>
      </div>
      <p className="text-sm max-w-prose">
        for each scenario: did the market reach it? one it never reached is
        invalidated.
      </p>
      <ul>
        {plan.scenarios.map((s, i) => (
          <li
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-border"
          >
            <span className="text-sm">
              <span className="font-medium">
                {LETTERS[i]} · {s.name}
              </span>
              <span className="text-label normal-case">
                {" "}
                {s.side} · {s.primaryTimeFrame}
              </span>
            </span>
            <VerdictToggle
              name={s.name}
              value={verdicts[s.id]}
              onChange={outcome =>
                setVerdicts(v => ({ ...v, [s.id]: outcome }))
              }
            />
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-6 pt-2">
        <button
          type="button"
          disabled={!ready}
          onClick={() => planStore.close(plan.id, verdicts)}
          className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
        >
          close plan
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

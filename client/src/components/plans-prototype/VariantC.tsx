// PROTOTYPE (TASK-72) · Variant C "scenario columns".
// Market context is the premise; scenarios sit side by side as the paths
// the market can take, manually ordered. Closing turns the same columns into
// a verdict board in place. List shows each open plan with its scenarios.
import { INPUT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight } from "lucide-react";
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

const sideMark = (side: Side) => (side === "long" ? "↑" : "↓");

export function ListC() {
  const plans = usePlans();
  const { href, go } = usePlansNav();
  const [symbol, setSymbol] = useState("");
  const open = openPlans(plans);
  const closedByDay = groupByCloseDay(closedPlans(plans));

  return (
    <div className="space-y-14 max-w-5xl pb-24">
      <form
        onSubmit={event => {
          event.preventDefault();
          if (!symbol.trim()) return;
          go(`/plans/${planStore.create(symbol)}`);
        }}
        className="space-y-2"
      >
        <label htmlFor="c-symbol" className="text-label block">
          new plan · type a symbol, press enter
        </label>
        <input
          id="c-symbol"
          value={symbol}
          onChange={event => setSymbol(event.target.value.toUpperCase())}
          list="plan-symbols-c"
          placeholder="SYMBOL"
          autoComplete="off"
          className="text-display w-full bg-transparent border-0 border-b border-border focus:border-foreground focus:outline-none px-0 uppercase placeholder:opacity-15"
        />
        <datalist id="plan-symbols-c">
          {SYMBOL_SUGGESTIONS.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </form>

      <section aria-labelledby="c-open" className="space-y-2">
        <SectionHeader id="c-open">open · {open.length}</SectionHeader>
        {open.length === 0 && <p className="py-4 text-sm">no open plans.</p>}
        {open.map(p => (
          <Link
            key={p.id}
            href={href(`/plans/${p.id}`)}
            className="grid gap-x-10 gap-y-3 md:grid-cols-[14rem_1fr] py-6 border-b border-border group"
          >
            <div className="space-y-1">
              <p className="text-heading group-hover:underline">
                {p.symbol.toLowerCase()}
              </p>
              <p className="text-label">
                open {openFor(p)} · {p.observations.length} observations
              </p>
            </div>
            {p.scenarios.length === 0 ? (
              <p className="text-sm self-center">no scenarios yet.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {p.scenarios.map(s => (
                  <li
                    key={s.id}
                    className="grid grid-cols-[1.25rem_3rem_1fr] gap-x-2"
                  >
                    <span aria-label={s.side}>{sideMark(s.side)}</span>
                    <span className="tabular-nums">{s.primaryTimeFrame}</span>
                    <span>{s.name}</span>
                  </li>
                ))}
              </ol>
            )}
          </Link>
        ))}
      </section>

      <section aria-labelledby="c-closed" className="space-y-6">
        <SectionHeader id="c-closed">closed</SectionHeader>
        <table className="w-full text-sm">
          <tbody>
            {closedByDay.map(([day, dayPlans]) =>
              dayPlans.map((p, i) => {
                const tally = outcomeTally(p);
                return (
                  <tr
                    key={p.id}
                    className={cn(
                      "align-baseline",
                      i === 0 && "border-t border-border"
                    )}
                  >
                    <td className="py-2 w-36 text-label">
                      {i === 0 ? day : ""}
                    </td>
                    <td className="py-2 w-16 tabular-nums">
                      {hhmm(p.closedAt ?? 0)}
                    </td>
                    <td className="py-2">
                      <Link
                        href={href(`/plans/${p.id}`)}
                        className="font-medium hover:underline"
                      >
                        {p.symbol.toLowerCase()}
                      </Link>
                    </td>
                    <td className="py-2 w-24">
                      <OutcomeGlyphs plan={p} />
                    </td>
                    <td className="py-2 w-20 text-right tabular-nums">
                      {p.scenarios.length === 0
                        ? "—"
                        : `${tally.triggered}/${p.scenarios.length}`}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        <p className="text-label">
          ● triggered · ○ invalidated · n/m triggered
        </p>
      </section>
    </div>
  );
}

export function DetailC({ planId }: { planId: number }) {
  const plan = usePlan(planId);
  const { href, go } = usePlansNav();
  const [verdicts, setVerdicts] = useState<Record<number, Outcome> | null>(
    null
  );
  const [deleting, setDeleting] = useState(false);

  if (!plan) {
    return (
      <Link href={href("/plans")} className="text-sm hover:underline">
        plan not found · ← plans
      </Link>
    );
  }
  const isOpen = plan.closedAt === null;
  const judging = verdicts !== null;
  const done = judging ? plan.scenarios.filter(s => verdicts[s.id]).length : 0;
  const observations = [...plan.observations].reverse();

  return (
    <div className="space-y-12 pb-32">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <Link
          href={href("/plans")}
          className="text-label hover:text-foreground"
        >
          ← plans
        </Link>
        <div className="flex items-baseline gap-6">
          <SavedMark ts={plan.updatedAt} />
          {isOpen && !judging && (
            <button
              type="button"
              onClick={() =>
                plan.scenarios.length === 0
                  ? planStore.close(plan.id, {})
                  : setVerdicts(initialVerdicts(plan))
              }
              className="text-sm underline underline-offset-4 hover:no-underline"
            >
              close plan
            </button>
          )}
          {!isOpen && (
            <button
              type="button"
              onClick={() => planStore.reopen(plan.id)}
              className="text-sm underline underline-offset-4 hover:no-underline"
            >
              reopen
            </button>
          )}
          <button
            type="button"
            onClick={() => setDeleting(true)}
            className="text-label hover:text-foreground"
          >
            delete
          </button>
        </div>
      </div>

      <header className="grid gap-x-12 gap-y-6 lg:grid-cols-[auto_minmax(0,1fr)]">
        <div className="space-y-2">
          <h1 className="text-display whitespace-nowrap">{plan.symbol}</h1>
          <p className="text-label">
            {isOpen
              ? `open ${openFor(plan)} · since ${dayTime(plan.createdAt)}`
              : `closed ${dayTime(plan.closedAt ?? 0)}`}
          </p>
        </div>
        <div className="space-y-2 lg:pt-3">
          <p className="text-label">market context</p>
          <PlanEditor
            content={plan.marketContext}
            editable={isOpen && !judging}
            onSave={json => planStore.setMarketContext(plan.id, json)}
            placeholder="the premise: what is the market doing, and why now?"
          />
        </div>
      </header>

      <section aria-labelledby="c-scenarios" className="space-y-4">
        <h2
          id="c-scenarios"
          className="text-label border-b border-foreground pb-3"
        >
          {judging
            ? "verdicts · did the market reach each scenario?"
            : `scenarios · ${plan.scenarios.length}`}
        </h2>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(17rem,1fr))] border-l border-border">
          {plan.scenarios.map((s, i) => (
            <ScenarioColumnC
              key={s.id}
              plan={plan}
              scenario={s}
              index={i}
              verdict={judging ? verdicts[s.id] : undefined}
              judging={judging}
              onVerdict={outcome =>
                setVerdicts(v => ({ ...(v ?? {}), [s.id]: outcome }))
              }
            />
          ))}
          {isOpen && !judging && <AddScenarioColumnC planId={plan.id} />}
        </div>
        {!isOpen && plan.scenarios.length === 0 && (
          <p className="text-sm">no scenarios were written.</p>
        )}
      </section>

      <section aria-labelledby="c-obs" className="space-y-4 max-w-3xl">
        <h2 id="c-obs" className="text-label border-b border-border pb-3">
          observations · {plan.observations.length}
        </h2>
        {isOpen && !judging && <ObservationComposer planId={plan.id} />}
        <ol>
          {observations.map(o => (
            <li
              key={o.id}
              className="grid grid-cols-[8rem_1fr] gap-x-6 py-3 border-b border-border"
            >
              <span className="text-sm tabular-nums pt-px">
                {dayTime(o.createdAt)}
              </span>
              <PlanEditor
                content={o.content}
                editable={isOpen && !judging}
                onSave={json =>
                  planStore.updateObservation(plan.id, o.id, json)
                }
              />
            </li>
          ))}
        </ol>
        {plan.observations.length === 0 && (
          <p className="text-sm">nothing logged.</p>
        )}
      </section>

      {judging && (
        <div className="sticky bottom-16 z-40 flex flex-wrap items-center justify-between gap-4 border border-foreground bg-background px-5 py-3">
          <span className="text-sm tabular-nums">
            {done} of {plan.scenarios.length} verdicts
          </span>
          <div className="flex items-center gap-5">
            <button
              type="button"
              onClick={() => setVerdicts(null)}
              className="text-label hover:text-foreground"
            >
              cancel
            </button>
            <button
              type="button"
              disabled={done < plan.scenarios.length}
              onClick={() => {
                planStore.close(plan.id, verdicts);
                setVerdicts(null);
              }}
              className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
            >
              confirm close
            </button>
          </div>
        </div>
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

function ScenarioColumnC({
  plan,
  scenario,
  index,
  verdict,
  judging,
  onVerdict,
}: {
  plan: Plan;
  scenario: Scenario;
  index: number;
  verdict: Outcome | undefined;
  judging: boolean;
  onVerdict: (outcome: Outcome) => void;
}) {
  const isOpen = plan.closedAt === null;
  const editable = isOpen && !judging;
  const update = (patch: Partial<Scenario>) =>
    planStore.updateScenario(plan.id, scenario.id, patch);
  const last = index === plan.scenarios.length - 1;

  return (
    <article
      aria-label={scenario.name}
      className="border-r border-b border-border p-5 space-y-4 min-w-0"
    >
      <div className="flex items-center justify-between text-label">
        <span className="normal-case">
          scenario {index + 1} · {sideMark(scenario.side)} {scenario.side} ·{" "}
          {scenario.primaryTimeFrame}
        </span>
        {editable && (
          <span className="flex items-center gap-1">
            <button
              type="button"
              disabled={index === 0}
              onClick={() => planStore.moveScenario(plan.id, scenario.id, -1)}
              aria-label="move left"
              className="p-0.5 hover:text-foreground disabled:opacity-20"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              disabled={last}
              onClick={() => planStore.moveScenario(plan.id, scenario.id, 1)}
              aria-label="move right"
              className="p-0.5 hover:text-foreground disabled:opacity-20"
            >
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>

      {editable ? (
        <textarea
          defaultValue={scenario.name}
          rows={1}
          onBlur={event =>
            event.target.value.trim() &&
            update({ name: event.target.value.trim() })
          }
          aria-label="scenario name"
          className="w-full resize-none [field-sizing:content] bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none px-0 text-xl font-medium leading-tight"
        />
      ) : (
        <p className="text-xl font-medium leading-tight">{scenario.name}</p>
      )}

      {judging && (
        <VerdictToggle
          name={scenario.name}
          value={verdict}
          onChange={onVerdict}
          size="lg"
        />
      )}
      {!isOpen && scenario.outcome && (
        <p className="text-base font-medium">
          {scenario.outcome === "triggered" ? "● triggered" : "○ invalidated"}
        </p>
      )}

      {editable && (
        <div className="space-y-2">
          <Segmented<Side>
            options={["long", "short"]}
            value={scenario.side}
            onChange={side => update({ side })}
            label="side"
          />
          <Segmented<ScenarioTimeFrame>
            options={SCENARIO_TIME_FRAMES}
            value={scenario.primaryTimeFrame}
            onChange={primaryTimeFrame => update({ primaryTimeFrame })}
            label="primary timeframe"
          />
        </div>
      )}

      <div className={cn(judging && "opacity-60")}>
        <PlanEditor
          content={scenario.content}
          editable={editable}
          onSave={json => update({ content: json })}
          placeholder="if…, then…"
        />
      </div>

      {editable && (
        <button
          type="button"
          onClick={() => planStore.deleteScenario(plan.id, scenario.id)}
          className="text-label hover:text-foreground"
        >
          delete scenario
        </button>
      )}
    </article>
  );
}

function AddScenarioColumnC({ planId }: { planId: number }) {
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
      className="border-r border-b border-dashed border-border p-5 space-y-4"
    >
      <p className="text-label">+ new scenario</p>
      <input
        value={name}
        onChange={event => setName(event.target.value)}
        placeholder="name it"
        aria-label="new scenario name"
        className={INPUT_CLASS}
      />
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
        className="text-label hover:text-foreground disabled:opacity-40"
      >
        add scenario →
      </button>
    </form>
  );
}

// PROTOTYPE (TASK-72) · Variant B "index + sheet".
// The plan index stays on screen beside the open plan (list and detail share
// one page). The hero is the open-for duration. Scenarios are a compact table
// that expands one row at a time. Observations newest first. Close happens in
// a side sheet.
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { INPUT_CLASS } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Fragment, useState } from "react";
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
  planStore,
  usePlan,
  usePlans,
  type Outcome,
  type Plan,
  type Scenario,
  type ScenarioTimeFrame,
  type Side,
} from "./store";

export function PageB({ planId }: { planId: number | null }) {
  return (
    <div className="grid gap-10 md:grid-cols-[15rem_1fr] items-start pb-24">
      <PlanIndexB selectedId={planId} />
      <div className="min-w-0 md:border-l md:border-border md:pl-10">
        {planId === null ? <EmptyB /> : <DetailB planId={planId} />}
      </div>
    </div>
  );
}

function PlanIndexB({ selectedId }: { selectedId: number | null }) {
  const plans = usePlans();
  const { href, go } = usePlansNav();
  const [symbol, setSymbol] = useState("");
  const open = openPlans(plans);
  const closedByDay = groupByCloseDay(closedPlans(plans));

  const Row = ({ p, left }: { p: Plan; left: string }) => (
    <li>
      <Link
        href={href(`/plans/${p.id}`)}
        aria-current={p.id === selectedId ? "page" : undefined}
        className={cn(
          "grid grid-cols-[3.5rem_1fr_auto] gap-x-2 items-baseline px-2 py-1.5 text-sm",
          p.id === selectedId
            ? "bg-foreground text-background"
            : "hover:bg-accent"
        )}
      >
        <span className="tabular-nums text-xs">{left}</span>
        <span className="font-medium truncate">{p.symbol.toLowerCase()}</span>
        <span className="text-xs">
          {p.closedAt === null ? (
            p.scenarios.length
          ) : (
            <OutcomeGlyphs plan={p} />
          )}
        </span>
      </Link>
    </li>
  );

  return (
    <aside
      className={cn(
        "space-y-8 md:sticky md:top-6",
        // On a phone the open plan replaces the index.
        selectedId !== null && "hidden md:block"
      )}
      aria-label="plan index"
    >
      <div className="space-y-1">
        <p className="text-title">plans</p>
      </div>
      <form
        onSubmit={event => {
          event.preventDefault();
          if (!symbol.trim()) return;
          go(`/plans/${planStore.create(symbol)}`);
          setSymbol("");
        }}
      >
        <input
          value={symbol}
          onChange={event => setSymbol(event.target.value.toUpperCase())}
          list="plan-symbols-b"
          placeholder="+ new plan: symbol ↵"
          aria-label="symbol for a new plan"
          className={cn(INPUT_CLASS, "uppercase placeholder:normal-case")}
        />
        <datalist id="plan-symbols-b">
          {SYMBOL_SUGGESTIONS.map(s => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </form>
      <div className="space-y-2">
        <p className="text-label px-2">open · {open.length}</p>
        {open.length === 0 ? (
          <p className="text-xs px-2">none</p>
        ) : (
          <ul>
            {open.map(p => (
              <Row key={p.id} p={p} left={openFor(p)} />
            ))}
          </ul>
        )}
      </div>
      {closedByDay.map(([day, dayPlans]) => (
        <div key={day} className="space-y-2">
          <p className="text-label px-2">{day}</p>
          <ul>
            {dayPlans.map(p => (
              <Row key={p.id} p={p} left={hhmm(p.closedAt ?? 0)} />
            ))}
          </ul>
        </div>
      ))}
    </aside>
  );
}

function EmptyB() {
  const open = openPlans(usePlans());
  return (
    <div className="space-y-4 pt-2">
      <p className="text-display tabular-nums">{open.length}</p>
      <p className="text-label">open plans</p>
      <p className="text-sm max-w-prose pt-4">
        pick a plan from the index, or type a symbol under “plans” to write a
        new one. a plan holds the market context, the scenarios you would trade,
        and what you observe while it is open.
      </p>
    </div>
  );
}

function DetailB({ planId }: { planId: number }) {
  const plan = usePlan(planId);
  const { go } = usePlansNav();
  const [expanded, setExpanded] = useState<number | null>(null);
  const [closing, setClosing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!plan) return <p className="text-title">plan not found</p>;
  const isOpen = plan.closedAt === null;
  const observations = [...plan.observations].reverse();

  return (
    <div className="space-y-12 max-w-4xl">
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-2">
          <p className="text-heading">
            {plan.symbol}
            <span className="text-label ml-3">
              {isOpen ? "open" : `closed ${dayTime(plan.closedAt ?? 0)}`}
            </span>
          </p>
          <p className="text-display tabular-nums">{openFor(plan)}</p>
          <p className="text-label">
            {isOpen ? "open for" : "was open"} · since {dayTime(plan.createdAt)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <SavedMark ts={plan.updatedAt} />
          <div className="flex items-center gap-4">
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
                close plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => planStore.reopen(plan.id)}
                className="border border-foreground px-4 py-2 text-sm hover:bg-foreground hover:text-background"
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
      </header>

      <section aria-labelledby="b-context" className="space-y-3">
        <h2 id="b-context" className="text-label">
          market context
        </h2>
        <PlanEditor
          content={plan.marketContext}
          editable={isOpen}
          onSave={json => planStore.setMarketContext(plan.id, json)}
          placeholder="what is the market doing, and why this symbol now?"
        />
      </section>

      <section aria-labelledby="b-scenarios" className="space-y-3">
        <h2 id="b-scenarios" className="text-label">
          scenarios · {plan.scenarios.length}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-label text-left border-b border-foreground">
                <th className="py-2 w-6" />
                <th className="py-2 font-normal">name</th>
                <th className="py-2 font-normal w-16">side</th>
                <th className="py-2 font-normal w-14">tf</th>
                <th className="py-2 font-normal w-32">outcome</th>
              </tr>
            </thead>
            <tbody>
              {plan.scenarios.map(s => (
                <ScenarioRowB
                  key={s.id}
                  plan={plan}
                  scenario={s}
                  expanded={expanded === s.id}
                  onToggle={() => setExpanded(e => (e === s.id ? null : s.id))}
                />
              ))}
              {isOpen && (
                <AddScenarioRowB
                  planId={plan.id}
                  onAdded={scenarioId => setExpanded(scenarioId)}
                />
              )}
            </tbody>
          </table>
        </div>
        {plan.scenarios.length === 0 && !isOpen && (
          <p className="text-sm">no scenarios were written.</p>
        )}
      </section>

      <section aria-labelledby="b-obs" className="space-y-4">
        <h2 id="b-obs" className="text-label">
          observations · {plan.observations.length} · newest first
        </h2>
        {isOpen && <ObservationComposer planId={plan.id} label="log" />}
        <ol className="space-y-0">
          {observations.map(o => (
            <li
              key={o.id}
              className="grid grid-cols-[5.5rem_1fr] gap-x-6 py-3 border-b border-border"
            >
              <span className="tabular-nums text-sm pt-px">
                {hhmm(o.createdAt)}
                <span className="block text-label">
                  {dayTime(o.createdAt).slice(0, -6)}
                </span>
              </span>
              <PlanEditor
                content={o.content}
                editable={isOpen}
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

      <CloseSheetB plan={plan} open={closing} onOpenChange={setClosing} />
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

function ScenarioRowB({
  plan,
  scenario,
  expanded,
  onToggle,
}: {
  plan: Plan;
  scenario: Scenario;
  expanded: boolean;
  onToggle: () => void;
}) {
  const editable = plan.closedAt === null;
  const update = (patch: Partial<Scenario>) =>
    planStore.updateScenario(plan.id, scenario.id, patch);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <Fragment>
      <tr
        className={cn(
          "border-b border-border cursor-pointer hover:bg-accent",
          expanded && "border-b-0"
        )}
        onClick={onToggle}
      >
        <td className="py-2.5">
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={`${expanded ? "collapse" : "expand"} ${scenario.name}`}
            className="flex"
          >
            <Chevron className="h-4 w-4" />
          </button>
        </td>
        <td className="py-2.5 font-medium">{scenario.name}</td>
        <td className="py-2.5">{scenario.side}</td>
        <td className="py-2.5">{scenario.primaryTimeFrame}</td>
        <td className="py-2.5">
          {scenario.outcome && !editable
            ? scenario.outcome === "triggered"
              ? "● triggered"
              : "○ invalidated"
            : "—"}
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border">
          <td />
          <td colSpan={4} className="pb-5 pt-1">
            <div className="space-y-3">
              {editable && (
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                  <input
                    defaultValue={scenario.name}
                    onBlur={event =>
                      event.target.value.trim() &&
                      update({ name: event.target.value.trim() })
                    }
                    aria-label="scenario name"
                    className={cn(INPUT_CLASS, "w-56")}
                  />
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
                  <button
                    type="button"
                    onClick={() =>
                      planStore.deleteScenario(plan.id, scenario.id)
                    }
                    className="text-label hover:text-foreground ml-auto"
                  >
                    delete scenario
                  </button>
                </div>
              )}
              <PlanEditor
                content={scenario.content}
                editable={editable}
                onSave={json => update({ content: json })}
                placeholder="trigger, entry, stop, target."
              />
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}

function AddScenarioRowB({
  planId,
  onAdded,
}: {
  planId: number;
  onAdded: (scenarioId: number) => void;
}) {
  const [name, setName] = useState("");
  const [side, setSide] = useState<Side>("long");
  const [tf, setTf] = useState<ScenarioTimeFrame>("1H");
  const add = () => {
    if (!name.trim()) return;
    onAdded(
      planStore.addScenario(planId, {
        name: name.trim(),
        side,
        primaryTimeFrame: tf,
      })
    );
    setName("");
  };
  return (
    <tr>
      <td className="py-2.5 opacity-40">+</td>
      <td className="py-2.5 pr-4">
        <input
          value={name}
          onChange={event => setName(event.target.value)}
          onKeyDown={event => event.key === "Enter" && add()}
          placeholder="add scenario ↵"
          aria-label="new scenario name"
          className={INPUT_CLASS}
        />
      </td>
      <td className="py-2.5">
        <select
          value={side}
          onChange={event => setSide(event.target.value as Side)}
          aria-label="new scenario side"
          className="bg-transparent text-sm"
        >
          <option value="long">long</option>
          <option value="short">short</option>
        </select>
      </td>
      <td className="py-2.5">
        <select
          value={tf}
          onChange={event => setTf(event.target.value as ScenarioTimeFrame)}
          aria-label="new scenario primary timeframe"
          className="bg-transparent text-sm"
        >
          {SCENARIO_TIME_FRAMES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2.5">
        <button
          type="button"
          onClick={add}
          disabled={!name.trim()}
          className="text-label hover:text-foreground disabled:opacity-40"
        >
          add →
        </button>
      </td>
    </tr>
  );
}

function CloseSheetB({
  plan,
  open,
  onOpenChange,
}: {
  plan: Plan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md p-0 gap-0 shadow-none">
        {open && <CloseFormB plan={plan} onDone={() => onOpenChange(false)} />}
      </SheetContent>
    </Sheet>
  );
}

function CloseFormB({ plan, onDone }: { plan: Plan; onDone: () => void }) {
  const [verdicts, setVerdicts] = useState<Record<number, Outcome>>(() =>
    initialVerdicts(plan)
  );
  const done = plan.scenarios.filter(s => verdicts[s.id]).length;
  return (
    <div className="flex flex-col h-full">
      <SheetHeader className="p-6 border-b border-border">
        <SheetTitle className="font-medium">
          close {plan.symbol.toLowerCase()}
        </SheetTitle>
        <SheetDescription>
          a verdict for every scenario. one the market never reached is
          invalidated.
        </SheetDescription>
      </SheetHeader>
      <ul className="flex-1 overflow-y-auto px-6">
        {plan.scenarios.map(s => (
          <li key={s.id} className="py-4 border-b border-border space-y-3">
            <p className="text-sm">
              <span className="font-medium">{s.name}</span>
              <span className="text-label normal-case">
                {" "}
                {s.side} · {s.primaryTimeFrame}
              </span>
            </p>
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
      <div className="p-6 border-t border-border flex items-center justify-between">
        <span className="text-label tabular-nums">
          {done} / {plan.scenarios.length}
        </span>
        <button
          type="button"
          disabled={done < plan.scenarios.length}
          onClick={() => {
            planStore.close(plan.id, verdicts);
            onDone();
          }}
          className="bg-foreground text-background px-4 py-2 text-sm disabled:opacity-40"
        >
          close plan
        </button>
      </div>
    </div>
  );
}

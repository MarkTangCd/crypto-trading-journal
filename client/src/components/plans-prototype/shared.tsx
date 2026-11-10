// PROTOTYPE (TASK-72). Small pieces every variant uses: the variant switcher,
// variant-preserving links, and plan formatting helpers.
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
import { cn } from "@/lib/utils";
import { fmtDate, fmtDuration } from "@/lib/ledger";
import { utc8Parts } from "@shared/time";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useLocation, useSearch } from "wouter";
import type { Outcome, Plan } from "./store";

export const VARIANTS = [
  { key: "A", name: "ledger" },
  { key: "B", name: "index + sheet" },
  { key: "C", name: "scenario columns" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export function useVariant(): VariantKey {
  const params = new URLSearchParams(useSearch());
  const raw = params.get("variant");
  return VARIANTS.find(v => v.key === raw)?.key ?? "A";
}

// Navigate inside the prototype without losing ?variant=.
export function usePlansNav() {
  const variant = useVariant();
  const [, setLocation] = useLocation();
  const href = useCallback(
    (path: string) => `${path}?variant=${variant}`,
    [variant]
  );
  const go = useCallback(
    (path: string) => setLocation(href(path)),
    [href, setLocation]
  );
  return { href, go };
}

export function PrototypeSwitcher() {
  const current = useVariant();
  const [location, setLocation] = useLocation();
  const index = VARIANTS.findIndex(v => v.key === current);

  const step = useCallback(
    (delta: number) => {
      const next =
        VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      setLocation(`${location}?variant=${next.key}`, { replace: true });
    },
    [index, location, setLocation]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      role="toolbar"
      aria-label="prototype variant"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-1 rounded-full bg-[oklch(0.45_0.2_290)] text-white px-2 py-1 text-xs shadow-lg"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        className="p-1 hover:opacity-70"
        aria-label="previous variant"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        prototype · {current} ({VARIANTS[index].name})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        className="p-1 hover:opacity-70"
        aria-label="next variant"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// "nov 10 05:12"
export function dayTime(ts: number): string {
  const p = utc8Parts(ts);
  return `${p.monthName.toLowerCase()} ${p.day} ${p.hhmm}`;
}

export function hhmm(ts: number): string {
  return utc8Parts(ts).hhmm;
}

export function openFor(p: Plan, now = Date.now()): string {
  return fmtDuration(p.createdAt, p.closedAt ?? now);
}

// Closed plans bucketed by UTC+8 close day, newest first.
export function groupByCloseDay(closed: Plan[]): [string, Plan[]][] {
  const days = new Map<string, Plan[]>();
  for (const p of closed) {
    const day = fmtDate(p.closedAt ?? p.createdAt);
    days.set(day, [...(days.get(day) ?? []), p]);
  }
  return [...days.entries()];
}

// Outcome glyphs: filled = triggered, hollow = invalidated, dash = no verdict.
// Ink only; outcomes are not trade wins or losses (One-Signal Rule).
export function OutcomeGlyphs({ plan }: { plan: Plan }) {
  if (plan.scenarios.length === 0) {
    return <span className="text-label">no scenarios</span>;
  }
  return (
    <span
      className="tracking-[0.2em]"
      aria-label={plan.scenarios
        .map(s => `${s.name}: ${s.outcome ?? "no verdict"}`)
        .join(", ")}
    >
      {plan.scenarios
        .map(s =>
          s.outcome === "triggered"
            ? "●"
            : s.outcome === "invalidated"
              ? "○"
              : "·"
        )
        .join("")}
    </span>
  );
}

export function SavedMark({ ts }: { ts: number }) {
  return (
    <span className="text-label tabular-nums" aria-live="polite">
      saved {hhmm(ts)}
    </span>
  );
}

// Two-way verdict control used by every close flow.
export function VerdictToggle({
  value,
  onChange,
  name,
  size = "sm",
}: {
  value: Outcome | undefined;
  onChange: (outcome: Outcome) => void;
  name: string;
  size?: "sm" | "lg";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={`verdict for ${name}`}
      className={cn("flex", size === "lg" && "w-full")}
    >
      {(["triggered", "invalidated"] as const).map(outcome => (
        <button
          key={outcome}
          type="button"
          role="radio"
          aria-checked={value === outcome}
          onClick={() => onChange(outcome)}
          className={cn(
            "border border-border -ml-px first:ml-0 transition-colors whitespace-nowrap",
            size === "lg" ? "flex-1 px-2 py-2 text-xs" : "px-2.5 py-1 text-xs",
            value === outcome
              ? "bg-foreground text-background border-foreground relative z-10"
              : "hover:border-foreground"
          )}
        >
          {outcome === "triggered" ? "● triggered" : "○ invalidated"}
        </button>
      ))}
    </div>
  );
}

// Segmented timeframe / side pickers: one click, keyboard reachable.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap">
      {options.map(option => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          onClick={() => onChange(option)}
          className={cn(
            "px-2 py-0.5 text-xs transition-colors",
            value === option
              ? "bg-foreground text-background"
              : "hover:underline disabled:hover:no-underline disabled:opacity-40"
          )}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function DeletePlanDialog({
  plan,
  onCancel,
  onConfirm,
}: {
  plan: Plan | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={plan !== null}
      onOpenChange={open => !open && onCancel()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>delete plan?</AlertDialogTitle>
          <AlertDialogDescription>
            {plan?.symbol.toLowerCase()} with {plan?.scenarios.length ?? 0}{" "}
            scenarios, {plan?.observations.length ?? 0} observations and every
            image in it. this can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>delete plan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

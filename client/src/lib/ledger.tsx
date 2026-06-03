import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type React from "react";

// Bench Notebook shared primitives. Brand-specific layer above shadcn.

export type Tone = "win" | "loss" | undefined;

// Underline-blank form field tokens. Compose with min-h / min-w where needed.
export const INPUT_CLASS =
  "w-full bg-transparent border-0 border-b border-border rounded-none shadow-none px-0 py-1.5 text-sm focus:outline-none focus-visible:outline-none focus:border-foreground focus-visible:border-foreground focus-visible:ring-0 transition-colors";

export const TEXTAREA_CLASS =
  "w-full bg-transparent border-0 border-b border-border rounded-none shadow-none px-0 py-2 text-sm leading-relaxed focus:outline-none focus-visible:outline-none focus:border-foreground focus-visible:border-foreground focus-visible:ring-0 transition-colors resize-y";

export const SELECT_CLASS = cn(INPUT_CLASS, "cursor-pointer appearance-none");

export function fmtMoney(value: number | string): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (Number.isNaN(n)) return "0.00";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtDateTime(ts: number | Date): string {
  return format(ts, "MMM d, yyyy HH:mm").toLowerCase();
}

export function fmtDate(ts: number | Date): string {
  return format(ts, "MMM d, yyyy").toLowerCase();
}

export function fmtDuration(start: number, end: number): string {
  const mins = Math.max(0, Math.round((end - start) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return remMins === 0 ? `${hours}h` : `${hours}h ${remMins}m`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours === 0 ? `${days}d` : `${days}d ${remHours}h`;
}

export function toneClass(tone: Tone): string {
  if (tone === "win") return "status-win";
  if (tone === "loss") return "status-loss";
  return "";
}

export function SectionHeader({
  id,
  children,
  action,
}: {
  id?: string;
  children: React.ReactNode;
  action?: { label: string; onClick: () => void };
}) {
  if (action) {
    return (
      <div className="flex items-baseline justify-between gap-4 border-b border-border pb-3">
        <h2 id={id} className="text-label">
          {children}
        </h2>
        <button
          type="button"
          onClick={action.onClick}
          className="text-label hover:text-foreground transition-colors"
        >
          {action.label} →
        </button>
      </div>
    );
  }
  return (
    <h2 id={id} className="text-label border-b border-border pb-3">
      {children}
    </h2>
  );
}

export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={htmlFor} className="text-label block">
        {label}
      </label>
      {children}
    </div>
  );
}

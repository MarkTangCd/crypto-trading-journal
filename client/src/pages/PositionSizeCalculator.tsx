import { useAccount } from "@/contexts/AccountContext";
import {
  Field,
  fmtDecimal,
  fmtMoney,
  INPUT_CLASS,
  SELECT_CLASS,
} from "@/lib/ledger";
import type { Direction } from "@/lib/plannedRiskReward";
import { previewPositionSize } from "@/lib/positionSize";
import { cn } from "@/lib/utils";
import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";

const RISK_KEY = "positionSize.risk";

export default function PositionSizeCalculator() {
  const { selectedAccount } = useAccount();
  const balance = selectedAccount?.balanceUsdt ?? null;

  const [direction, setDirection] = useState<Direction>("");
  const [risk, setRisk] = useState(
    () => localStorage.getItem(RISK_KEY) ?? "30"
  );
  const [entry, setEntry] = useState("");
  const [stop, setStop] = useState("");
  const [target, setTarget] = useState("");
  // Capital follows the account balance until the user edits it once.
  const [capital, setCapital] = useState("");
  const [capitalTouched, setCapitalTouched] = useState(false);

  useEffect(() => {
    localStorage.setItem(RISK_KEY, risk);
  }, [risk]);

  useEffect(() => {
    if (!capitalTouched && balance) setCapital(balance);
  }, [balance, capitalTouched]);

  const preview = useMemo(
    () =>
      previewPositionSize({
        direction,
        riskUsdt: risk,
        entry,
        stop,
        target,
        capital,
      }),
    [direction, risk, entry, stop, target, capital]
  );

  return (
    <div className="space-y-12 max-w-3xl">
      <Link
        href="/tools"
        className="text-label hover:text-foreground transition-colors inline-block"
      >
        ← tools
      </Link>

      <header className="space-y-2">
        <p className="text-title">position size</p>
        <p className="text-label">fixed-risk sizing from stop distance</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
        <Field label="direction" htmlFor="direction">
          <select
            id="direction"
            value={direction}
            onChange={e => setDirection(e.target.value as Direction)}
            className={SELECT_CLASS}
          >
            <option value="">—</option>
            <option value="long">long</option>
            <option value="short">short</option>
          </select>
        </Field>
        <Field label="risk (usdt)" htmlFor="risk">
          <input
            id="risk"
            type="text"
            inputMode="decimal"
            placeholder="30"
            value={risk}
            onChange={e => setRisk(e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="entry price" htmlFor="entry">
          <input
            id="entry"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={entry}
            onChange={e => setEntry(e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="stop loss" htmlFor="stop">
          <input
            id="stop"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={stop}
            onChange={e => setStop(e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="take profit (optional)" htmlFor="target">
          <input
            id="target"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={target}
            onChange={e => setTarget(e.target.value)}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
        <Field label="account capital (usdt)" htmlFor="capital">
          <input
            id="capital"
            type="text"
            inputMode="decimal"
            placeholder={balance === null ? "—" : "0.00"}
            value={capital}
            onChange={e => {
              setCapitalTouched(true);
              setCapital(e.target.value);
            }}
            className={cn(INPUT_CLASS, "tabular-nums")}
          />
        </Field>
      </div>

      <Result preview={preview} />
    </div>
  );
}

function Result({
  preview,
}: {
  preview: ReturnType<typeof previewPositionSize>;
}) {
  const ok = preview.kind === "ok" ? preview : null;
  const lev = ok?.leverageInfo ?? null;

  return (
    <section className="border-t border-border pt-6 space-y-6">
      <div>
        <p className="text-label">position size (usdt)</p>
        <p className="text-display mt-2">
          {ok ? fmtMoney(ok.positionSizeUsdt) : "—"}
        </p>
        {ok && (
          <p className="text-label mt-2">
            {fmtDecimal(ok.stopLossPct * 100, 4)}% stop ·{" "}
            {fmtMoney(ok.riskUsdt)} usdt risk
          </p>
        )}
        {preview.kind === "invalid" && (
          <p className="text-label mt-2 status-loss">{preview.reason}</p>
        )}
      </div>

      {lev && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-border pt-6">
          <div>
            <p className="text-label">leverage</p>
            <p className="mt-2 text-2xl font-medium tabular-nums">
              {lev.leverage}x
            </p>
          </div>
          <div>
            <p className="text-label">margin to deploy</p>
            <p className="mt-2 text-2xl font-medium tabular-nums">
              {fmtMoney(lev.margin)}
            </p>
            <p className="text-label mt-1">
              {lev.partial
                ? `${fmtDecimal(lev.pctOfCapital * 100, 2)}% of capital`
                : "full capital"}
            </p>
          </div>
          {ok?.rr !== null && ok?.rr !== undefined && (
            <div>
              <p className="text-label">r:r · profit at tp</p>
              <p className="mt-2 text-2xl font-medium tabular-nums">
                {ok.rr.toFixed(2)}
                <span className="text-label ml-2">
                  +{fmtMoney(ok.expectedProfit ?? 0)}
                </span>
              </p>
            </div>
          )}
        </div>
      )}

      {lev?.highLeverage && (
        <p className="text-label">
          stop too tight — {lev.leverage}x leverage is high
        </p>
      )}
    </section>
  );
}

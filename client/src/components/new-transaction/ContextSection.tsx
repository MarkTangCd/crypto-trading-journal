import {
  Field,
  INPUT_CLASS,
  SectionHeader,
  TEXTAREA_CLASS,
} from "@/lib/ledger";
import { cn } from "@/lib/utils";
import type React from "react";
import { useState } from "react";

type Props = {
  context: string;
  tradeItems: string[];
  tvUrl: string;
  onChangeContext: (v: string) => void;
  onChangeTradeItems: (v: string[]) => void;
  onChangeTvUrl: (v: string) => void;
};

export function ContextSection(props: Props) {
  const [tradeItemInput, setTradeItemInput] = useState("");

  const addTradeItem = () => {
    const tradeItem = tradeItemInput.trim();
    if (!tradeItem) {
      setTradeItemInput("");
      return;
    }
    props.onChangeTradeItems([...props.tradeItems, tradeItem]);
    setTradeItemInput("");
  };

  const handleTradeItemKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    addTradeItem();
  };

  return (
    <section className="space-y-6">
      <SectionHeader>context</SectionHeader>
      <Field label="market background" htmlFor="context">
        <textarea
          id="context"
          rows={5}
          placeholder="state the broader market conditions."
          value={props.context}
          onChange={e => props.onChangeContext(e.target.value)}
          className={cn(TEXTAREA_CLASS, "min-h-[7rem]")}
        />
      </Field>
      <Field label="trade items" htmlFor="tradeItemInput">
        <div className="space-y-3">
          {props.tradeItems.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="trade item tags">
              {props.tradeItems.map((item, index) => (
                <span
                  key={`${item}-${index}`}
                  className="border border-border px-2 py-1 text-xs font-mono text-foreground"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
          <input
            id="tradeItemInput"
            type="text"
            placeholder="press enter to add"
            value={tradeItemInput}
            onChange={e => setTradeItemInput(e.target.value)}
            onKeyDown={handleTradeItemKeyDown}
            className={INPUT_CLASS}
          />
        </div>
      </Field>
      <Field label="tradingview url (optional)" htmlFor="tvUrl">
        <input
          id="tvUrl"
          type="url"
          placeholder="https://www.tradingview.com/chart/..."
          value={props.tvUrl}
          onChange={e => props.onChangeTvUrl(e.target.value)}
          className={INPUT_CLASS}
        />
      </Field>
    </section>
  );
}

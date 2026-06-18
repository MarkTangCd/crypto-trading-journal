import { AccountMetaStrip } from "@/components/new-transaction/AccountMetaStrip";
import { ClassificationSection } from "@/components/new-transaction/ClassificationSection";
import { ContextSection } from "@/components/new-transaction/ContextSection";
import { EntryTimeSection } from "@/components/new-transaction/EntryTimeSection";
import { InstrumentSection } from "@/components/new-transaction/InstrumentSection";
import { PlanSection } from "@/components/new-transaction/PlanSection";
import { SubmitRow } from "@/components/new-transaction/SubmitRow";
import {
  INITIAL_FORM_DATA,
  REQUIRED_FIELDS,
  type FormData,
} from "@/components/new-transaction/formState";
import CandlestickChart from "@/components/CandlestickChart";
import { useAccount } from "@/contexts/AccountContext";
import { SectionHeader } from "@/lib/ledger";
import { MOCK_CANDLE_DATA } from "@/lib/mockCandleData";
import { previewPlannedRiskReward } from "@/lib/plannedRiskReward";
import { trpc } from "@/lib/trpc";
import { type MarketCycle, type TransactionType } from "@shared/const";
import { Loader2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

export default function NewTransaction() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const { selectedAccount } = useAccount();
  const accountId = selectedAccount?.id;

  const { data: formDefaults, isLoading: loadingDefaults } =
    trpc.transaction.getFormDefaults.useQuery(
      { accountId: accountId! },
      { enabled: !!accountId }
    );

  const createMutation = trpc.transaction.create.useMutation({
    onSuccess: () => {
      toast.success("trade recorded");
      utils.transaction.list.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      setLocation("/transactions");
    },
    onError: error => {
      toast.error(error.message || "failed to record trade");
    },
  });

  const [formData, setFormData] = useState<FormData>(INITIAL_FORM_DATA);

  const plannedRrPreview = useMemo(
    () =>
      previewPlannedRiskReward(
        formData.direction,
        formData.entryPrice,
        formData.plannedStopLossPrice,
        formData.plannedTakeProfitPrice
      ),
    [
      formData.direction,
      formData.entryPrice,
      formData.plannedStopLossPrice,
      formData.plannedTakeProfitPrice,
    ]
  );

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountId) {
      toast.error("select an account first");
      return;
    }

    if (REQUIRED_FIELDS.some(f => !formData[f])) {
      toast.error("fill in all required fields");
      return;
    }

    if (plannedRrPreview.kind === "invalid") {
      toast.error(`invalid plan: ${plannedRrPreview.reason}`);
      return;
    }

    const {
      startTime,
      direction,
      marketCycle,
      transactionType,
      tvUrl,
      ...rest
    } = formData;
    createMutation.mutate({
      accountId,
      startTime: new Date(startTime).getTime(),
      direction: direction as "long" | "short",
      marketCycle: marketCycle as MarketCycle,
      transactionType: transactionType as TransactionType,
      tvUrl: tvUrl || undefined,
      ...rest,
    });
  };

  if (loadingDefaults) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  return (
    <div className="space-y-12 max-w-3xl">
      <h1 className="sr-only">new trade</h1>

      <Link
        href="/transactions"
        className="text-label hover:text-foreground transition-colors inline-block"
      >
        ← transactions
      </Link>

      <header className="space-y-2">
        <p className="text-title">open trade</p>
        <p className="text-label">log a new entry to the journal</p>
      </header>

      <AccountMetaStrip
        currentBalance={formDefaults?.currentBalance || "0"}
        consecutiveLosses={formDefaults?.consecutiveLosses ?? 0}
      />

      <form onSubmit={handleSubmit} className="space-y-12">
        <InstrumentSection
          tradingPair={formData.tradingPair}
          timeFrame={formData.timeFrame}
          direction={formData.direction}
          onChange={(field, value) =>
            updateField(field, value as FormData[typeof field])
          }
        />

        <section className="space-y-4">
          <SectionHeader>chart</SectionHeader>
          <CandlestickChart data={MOCK_CANDLE_DATA} />
          <p className="text-label">click a candle to mark the entry point.</p>
        </section>

        <EntryTimeSection
          startTime={formData.startTime}
          onChange={v => updateField("startTime", v)}
        />

        <PlanSection
          entryPrice={formData.entryPrice}
          positionSizeUsdt={formData.positionSizeUsdt}
          plannedStopLossPrice={formData.plannedStopLossPrice}
          plannedTakeProfitPrice={formData.plannedTakeProfitPrice}
          preview={plannedRrPreview}
          onChange={(field, value) => updateField(field, value)}
        />

        <ClassificationSection
          marketCycle={formData.marketCycle}
          transactionType={formData.transactionType}
          onChangeMarketCycle={v => updateField("marketCycle", v)}
          onChangeTransactionType={v => updateField("transactionType", v)}
        />

        <ContextSection
          context={formData.context}
          tradeItems={formData.tradeItems}
          tvUrl={formData.tvUrl}
          onChangeContext={v => updateField("context", v)}
          onChangeTradeItems={v => updateField("tradeItems", v)}
          onChangeTvUrl={v => updateField("tvUrl", v)}
        />

        <SubmitRow
          pending={createMutation.isPending}
          disabled={!accountId}
          onCancel={() => setLocation("/transactions")}
        />
      </form>
    </div>
  );
}

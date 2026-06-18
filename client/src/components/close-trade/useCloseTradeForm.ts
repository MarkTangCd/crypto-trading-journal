import type { ClosePreview } from "@/lib/closePreview";
import { parsePositiveDecimal, previewClose } from "@/lib/closePreview";
import { trpc } from "@/lib/trpc";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

interface FormData {
  endTime: string;
  exitPrice: string;
}

const EMPTY_FORM: FormData = {
  endTime: "",
  exitPrice: "",
};

type Trade = {
  id: number;
  accountId: number;
  direction: string;
  startTime: number;
  entryPrice: string | null;
  positionSizeUsdt: string | null;
  plannedStopLossPrice: string | null;
};

type UseCloseTradeFormResult = {
  formData: FormData;
  closeMutation: ReturnType<typeof trpc.transaction.close.useMutation>;
  isLegacyOpen: boolean;
  currentBalanceNum: number;
  preview: ClosePreview;
  hasOkPreview: boolean;
  submitDisabled: boolean;
  updateField: <K extends keyof FormData>(field: K, value: FormData[K]) => void;
  handleSubmit: (e: React.FormEvent) => void;
};

export function useCloseTradeForm(
  trade: Trade | null,
  open: boolean,
  onOpenChange: (open: boolean) => void
): UseCloseTradeFormResult {
  const utils = trpc.useUtils();
  const tradeAccountId = trade?.accountId;

  const { data: formDefaults } = trpc.transaction.getFormDefaults.useQuery(
    { accountId: tradeAccountId! },
    { enabled: open && !!tradeAccountId }
  );

  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setFormData({
        ...EMPTY_FORM,
        endTime: now.toISOString().slice(0, 16),
      });
    }
  }, [open]);

  const closeMutation = trpc.transaction.close.useMutation({
    onSuccess: () => {
      toast.success("trade closed");
      utils.transaction.list.invalidate();
      utils.transaction.get.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      onOpenChange(false);
    },
    onError: error => {
      toast.error(error.message || "failed to close trade");
    },
  });

  const entryNum = useMemo(
    () => parsePositiveDecimal(trade?.entryPrice ?? null),
    [trade?.entryPrice]
  );
  const stopNum = useMemo(
    () => parsePositiveDecimal(trade?.plannedStopLossPrice ?? null),
    [trade?.plannedStopLossPrice]
  );
  const positionNum = useMemo(
    () => parsePositiveDecimal(trade?.positionSizeUsdt ?? null),
    [trade?.positionSizeUsdt]
  );

  const isLegacyOpen =
    !!trade && (entryNum === null || stopNum === null || positionNum === null);

  const currentBalanceNum = useMemo(() => {
    const v = parseFloat(formDefaults?.currentBalance || "0");
    return Number.isNaN(v) ? 0 : v;
  }, [formDefaults?.currentBalance]);

  const preview = useMemo<ClosePreview>(() => {
    if (!trade) return { kind: "missingExit" };
    if (entryNum === null || stopNum === null || positionNum === null) {
      return { kind: "missingExit" };
    }
    return previewClose(
      trade.direction,
      entryNum,
      stopNum,
      positionNum,
      formData.exitPrice
    );
  }, [trade, entryNum, stopNum, positionNum, formData.exitPrice]);

  const hasOkPreview = preview.kind === "ok";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!trade) return;

    if (isLegacyOpen) {
      toast.error(
        "this trade is missing entry price, position size, or planned stop loss"
      );
      return;
    }

    if (!formData.endTime || !formData.exitPrice) {
      toast.error("fill in all required fields");
      return;
    }

    if (preview.kind === "invalidExit") {
      toast.error("enter a valid positive exit price");
      return;
    }

    const endTimestamp = new Date(formData.endTime).getTime();
    if (endTimestamp <= trade.startTime) {
      toast.error("end time must be after start time");
      return;
    }

    closeMutation.mutate({
      id: trade.id,
      endTime: endTimestamp,
      exitPrice: formData.exitPrice,
    });
  };

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const submitDisabled =
    closeMutation.isPending || isLegacyOpen || !hasOkPreview;

  return {
    formData,
    closeMutation,
    isLegacyOpen,
    currentBalanceNum,
    preview,
    hasOkPreview,
    submitDisabled,
    updateField,
    handleSubmit,
  };
}

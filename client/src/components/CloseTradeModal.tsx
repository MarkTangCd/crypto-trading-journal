import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { useState, useMemo, useEffect } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";

interface CloseTradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trade: {
    id: number;
    tradingPair: string;
    direction: string;
    timeFrame: string;
    startTime: number;
  } | null;
}

export function CloseTradeModal({
  open,
  onOpenChange,
  trade,
}: CloseTradeModalProps) {
  const utils = trpc.useUtils();

  const { data: formDefaults } = trpc.transaction.getFormDefaults.useQuery(
    undefined,
    { enabled: open }
  );

  const [formData, setFormData] = useState({
    endTime: "",
    outcome: "" as "win" | "loss" | "breakeven" | "",
    riskRewardRatio: "",
    returnAmount: "",
  });

  useEffect(() => {
    if (open) {
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      setFormData(prev => ({
        ...prev,
        endTime: now.toISOString().slice(0, 16),
      }));
    }
  }, [open]);

  const closeMutation = trpc.transaction.close.useMutation({
    onSuccess: () => {
      toast.success("Trade closed successfully");
      utils.transaction.list.invalidate();
      utils.transaction.get.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      utils.stats.getBySystem.invalidate();
      onOpenChange(false);
    },
    onError: error => {
      toast.error(error.message || "Failed to close trade");
    },
  });

  const previewBalance = useMemo(() => {
    if (!formDefaults?.currentBalance) return "0.00";
    const current = parseFloat(formDefaults.currentBalance);
    const ret = parseFloat(formData.returnAmount || "0");
    return (current + ret).toFixed(2);
  }, [formDefaults?.currentBalance, formData.returnAmount]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!trade) return;

    if (
      !formData.endTime ||
      !formData.outcome ||
      !formData.riskRewardRatio ||
      !formData.returnAmount
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    const endTimestamp = new Date(formData.endTime).getTime();

    if (endTimestamp <= trade.startTime) {
      toast.error("End time must be after start time");
      return;
    }

    closeMutation.mutate({
      id: trade.id,
      endTime: endTimestamp,
      outcome: formData.outcome as "win" | "loss" | "breakeven",
      riskRewardRatio: formData.riskRewardRatio,
      returnAmount: formData.returnAmount,
    });
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  if (!trade) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Close Trade</DialogTitle>
            <DialogDescription>
              Record the outcome of your trade for {trade.tradingPair}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="rounded-lg bg-muted/50 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{trade.tradingPair}</span>
                <Badge
                  variant="outline"
                  className={
                    trade.direction === "long"
                      ? "direction-long border-current"
                      : "direction-short border-current"
                  }
                >
                  {trade.direction.toUpperCase()}
                </Badge>
                <Badge variant="secondary">{trade.timeFrame}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                Started: {format(new Date(trade.startTime), "MMM d, HH:mm")}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="endTime">End Time *</Label>
              <Input
                id="endTime"
                type="datetime-local"
                value={formData.endTime}
                onChange={e => updateField("endTime", e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="outcome">Outcome *</Label>
                <Select
                  value={formData.outcome}
                  onValueChange={v => updateField("outcome", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select outcome" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="win">
                      <span className="status-win font-medium">Win</span>
                    </SelectItem>
                    <SelectItem value="loss">
                      <span className="status-loss font-medium">Loss</span>
                    </SelectItem>
                    <SelectItem value="breakeven">
                      <span className="status-breakeven font-medium">
                        Break Even
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="riskRewardRatio">Risk-Reward Ratio *</Label>
                <Input
                  id="riskRewardRatio"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="e.g., 2.5"
                  value={formData.riskRewardRatio}
                  onChange={e => updateField("riskRewardRatio", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="returnAmount">Return Amount *</Label>
              <Input
                id="returnAmount"
                type="number"
                step="0.01"
                placeholder="e.g., -50 or 100"
                value={formData.returnAmount}
                onChange={e => updateField("returnAmount", e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Negative for loss, positive for profit
              </p>
            </div>

            <div className="rounded-lg border p-3 space-y-2 mt-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Balance</span>
                <span>${formDefaults?.currentBalance || "0.00"}</span>
              </div>
              <div className="flex justify-between text-sm font-medium">
                <span>New Balance</span>
                <span
                  className={
                    parseFloat(formData.returnAmount || "0") >= 0
                      ? "status-win"
                      : "status-loss"
                  }
                >
                  ${previewBalance}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={closeMutation.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={closeMutation.isPending}>
              {closeMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Closing...
                </>
              ) : (
                "Close Trade"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

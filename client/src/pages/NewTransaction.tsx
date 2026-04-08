import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getConfidenceColor, getConfidenceLabel } from "@/lib/confidence";
import { trpc } from "@/lib/trpc";
import { useAccount } from "@/contexts/AccountContext";
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Loader2,
  Layers,
  AlertCircle,
  Gauge,
  Tag,
  BarChart3,
} from "lucide-react";
import CandlestickChart from "@/components/CandlestickChart";
import { MOCK_CANDLE_DATA } from "@/lib/mockCandleData";

const TIME_FRAMES = ["1m", "5m", "15m", "30m", "1H", "4H", "1D", "1W", "1M"];

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
      toast.success("Transaction recorded successfully");
      utils.transaction.list.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
      utils.stats.getBySystem.invalidate();
      setLocation("/transactions");
    },
    onError: error => {
      toast.error(error.message || "Failed to create transaction");
    },
  });

  const [formData, setFormData] = useState({
    tradingPair: "",
    timeFrame: "",
    startTime: "",
    direction: "" as "long" | "short" | "",
    tradingLogic: "",
    marketCycle: "" as
      | "Trading Range"
      | "Upward Tight Channel"
      | "Downward Tight Channel"
      | "Upward Channel"
      | "Downward Channel"
      | "Upward Trend"
      | "Downward Trend"
      | "",
    transactionType: "" as "Trend" | "Reversal" | "",
    tvUrl: "",
  });

  const [selectedElementIds, setSelectedElementIds] = useState<number[]>([]);

  // Calculate confidence level from selected elements
  const calculatedConfidence = useMemo(() => {
    if (
      !formDefaults?.activeSystem?.elements ||
      selectedElementIds.length === 0
    ) {
      return null;
    }
    const selectedElements = formDefaults.activeSystem.elements.filter(
      (el: { id: number; confidenceLevel: number }) =>
        selectedElementIds.includes(el.id)
    );
    if (selectedElements.length === 0) return null;

    const totalConfidence = selectedElements.reduce(
      (sum: number, el: { confidenceLevel: number }) =>
        sum + el.confidenceLevel,
      0
    );
    return parseFloat((totalConfidence / selectedElements.length).toFixed(1));
  }, [formDefaults?.activeSystem?.elements, selectedElementIds]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !formData.tradingPair ||
      !formData.timeFrame ||
      !formData.startTime ||
      !formData.direction ||
      !formData.tradingLogic ||
      !formData.marketCycle ||
      !formData.transactionType
    ) {
      toast.error("Please fill in all required fields");
      return;
    }

    const startTimestamp = new Date(formData.startTime).getTime();

    createMutation.mutate({
      tradingPair: formData.tradingPair,
      timeFrame: formData.timeFrame,
      startTime: startTimestamp,
      direction: formData.direction as "long" | "short",
      tradingLogic: formData.tradingLogic,
      marketCycle: formData.marketCycle,
      transactionType: formData.transactionType,
      tvUrl: formData.tvUrl || undefined,
      selectedElementIds,
    });
  };

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleElement = (elementId: number) => {
    setSelectedElementIds(prev =>
      prev.includes(elementId)
        ? prev.filter(id => id !== elementId)
        : [...prev, elementId]
    );
  };

  if (loadingDefaults) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const activeSystemElements = formDefaults?.activeSystem?.elements || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading">Open Trade</h1>
        <p className="text-subtitle mt-1">
          Log a new trading record with all relevant details
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left column - Main form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Active Trading System Banner */}
            {formDefaults?.activeSystem ? (
              <Card className="border-green-200 bg-green-50/50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-green-100 p-2">
                      <Layers className="h-5 w-5 text-green-600" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        This trade will be linked to
                      </p>
                      <p className="font-semibold">
                        {formDefaults.activeSystem.name}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/trading-systems")}
                    >
                      Change
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="py-4">
                  <div className="flex items-center gap-3">
                    <div className="rounded-lg bg-amber-100 p-2">
                      <AlertCircle className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">No active trading system</p>
                      <p className="text-sm text-muted-foreground">
                        This trade won't be linked to any system
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setLocation("/trading-systems")}
                    >
                      Select System
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Trading Elements Selection */}
            {activeSystemElements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Tag className="h-5 w-5" />
                    Trading Elements Used
                  </CardTitle>
                  <CardDescription className="text-subtitle">
                    Select the elements from your trading system that were
                    present in this trade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {activeSystemElements.map(
                      (element: {
                        id: number;
                        name: string;
                        confidenceLevel: number;
                        description?: string | null;
                      }) => (
                        <div
                          key={element.id}
                          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                            selectedElementIds.includes(element.id)
                              ? "border-primary bg-primary/5"
                              : "hover:border-muted-foreground/30"
                          }`}
                          onClick={() => toggleElement(element.id)}
                        >
                          <Checkbox
                            checked={selectedElementIds.includes(element.id)}
                            onCheckedChange={() => toggleElement(element.id)}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {element.name}
                              </span>
                              <span
                                className={`text-xs ${getConfidenceColor(element.confidenceLevel)}`}
                              >
                                {element.confidenceLevel}/5
                              </span>
                            </div>
                            {element.description && (
                              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                {element.description}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    )}
                  </div>

                  {selectedElementIds.length > 0 &&
                    calculatedConfidence !== null && (
                      <div className="mt-4 p-3 rounded-lg bg-muted/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gauge className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Overall Confidence Score
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-lg font-bold ${getConfidenceColor(calculatedConfidence)}`}
                          >
                            {calculatedConfidence}/5
                          </span>
                          <span
                            className={`text-sm ${getConfidenceColor(calculatedConfidence)}`}
                          >
                            ({getConfidenceLabel(calculatedConfidence)})
                          </span>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            )}

            <Card data-testid="candlestick-chart-card">
              <CardHeader>
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Price Chart
                </CardTitle>
                <CardDescription className="text-subtitle">
                  Click a candle to mark the entry point
                </CardDescription>
              </CardHeader>
              <CardContent>
                <CandlestickChart data={MOCK_CANDLE_DATA} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Trade Details
                </CardTitle>
                <CardDescription className="text-subtitle">
                  Enter the basic information about your trade
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="tradingPair">Trading Pair *</Label>
                    <Input
                      id="tradingPair"
                      placeholder="e.g., BTCUSDT"
                      value={formData.tradingPair}
                      onChange={e =>
                        updateField("tradingPair", e.target.value.toUpperCase())
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timeFrame">Time Frame *</Label>
                    <Select
                      value={formData.timeFrame}
                      onValueChange={v => updateField("timeFrame", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time frame" />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_FRAMES.map(tf => (
                          <SelectItem key={tf} value={tf}>
                            {tf}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="startTime">Start Time *</Label>
                  <Input
                    id="startTime"
                    type="datetime-local"
                    value={formData.startTime}
                    onChange={e => updateField("startTime", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="direction">Direction *</Label>
                  <Select
                    value={formData.direction}
                    onValueChange={v => updateField("direction", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select direction" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="long">
                        <span className="direction-long font-medium">Long</span>
                      </SelectItem>
                      <SelectItem value="short">
                        <span className="direction-short font-medium">
                          Short
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="marketCycle">Market Cycle *</Label>
                    <Select
                      value={formData.marketCycle}
                      onValueChange={v => updateField("marketCycle", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select market cycle" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Trading Range">
                          Trading Range
                        </SelectItem>
                        <SelectItem value="Upward Tight Channel">
                          Upward Tight Channel
                        </SelectItem>
                        <SelectItem value="Downward Tight Channel">
                          Downward Tight Channel
                        </SelectItem>
                        <SelectItem value="Upward Channel">
                          Upward Channel
                        </SelectItem>
                        <SelectItem value="Downward Channel">
                          Downward Channel
                        </SelectItem>
                        <SelectItem value="Upward Trend">
                          Upward Trend
                        </SelectItem>
                        <SelectItem value="Downward Trend">
                          Downward Trend
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="transactionType">Transaction Type *</Label>
                    <Select
                      value={formData.transactionType}
                      onValueChange={v => updateField("transactionType", v)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Trend">Trend</SelectItem>
                        <SelectItem value="Reversal">Reversal</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tradingLogic">Trading Logic *</Label>
                  <Textarea
                    id="tradingLogic"
                    placeholder="Describe your rationale for initiating this trade..."
                    rows={4}
                    value={formData.tradingLogic}
                    onChange={e => updateField("tradingLogic", e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="tvUrl">TradingView URL (Optional)</Label>
                  <Input
                    id="tvUrl"
                    type="url"
                    placeholder="https://www.tradingview.com/chart/..."
                    value={formData.tvUrl}
                    onChange={e => updateField("tvUrl", e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right column - Summary */}
          <div className="space-y-6">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg font-semibold">
                  Account Summary
                </CardTitle>
                <CardDescription className="text-subtitle">
                  Auto-calculated values
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  {formDefaults?.activeSystem && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">
                        Trading System
                      </span>
                      <Badge variant="secondary">
                        {formDefaults.activeSystem.name}
                      </Badge>
                    </div>
                  )}
                  {calculatedConfidence !== null && (
                    <div className="flex justify-between items-center py-2 border-b">
                      <span className="text-sm text-muted-foreground">
                        Confidence Score
                      </span>
                      <span
                        className={`font-semibold ${getConfidenceColor(calculatedConfidence)}`}
                      >
                        {calculatedConfidence}/5
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 border-b">
                    <span className="text-sm text-muted-foreground">
                      Current Balance
                    </span>
                    <span className="font-semibold">
                      ${formDefaults?.currentBalance || "0.00"}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">
                      Current Losing Streak
                    </span>
                    <span className="font-semibold">
                      {formDefaults?.consecutiveLosses || 0}
                    </span>
                  </div>
                </div>

                {selectedElementIds.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground mb-2">
                      Selected Elements
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {activeSystemElements
                        .filter((el: { id: number }) =>
                          selectedElementIds.includes(el.id)
                        )
                        .map((el: { id: number; name: string }) => (
                          <Badge
                            key={el.id}
                            variant="outline"
                            className="text-xs"
                          >
                            {el.name}
                          </Badge>
                        ))}
                    </div>
                  </div>
                )}

                <div className="pt-4 space-y-3">
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Recording...
                      </>
                    ) : (
                      "Record Transaction"
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => setLocation("/transactions")}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Loader2, Save, Wallet } from "lucide-react";

export default function Settings() {
  const utils = trpc.useUtils();
  
  const { data: settings, isLoading } = trpc.user.getSettings.useQuery();
  const [initialBalance, setInitialBalance] = useState("");

  useEffect(() => {
    if (settings) {
      setInitialBalance(settings.initialBalance || "0");
    }
  }, [settings]);

  const updateMutation = trpc.user.setInitialBalance.useMutation({
    onSuccess: () => {
      toast.success("Settings saved successfully");
      utils.user.getSettings.invalidate();
      utils.transaction.getFormDefaults.invalidate();
      utils.stats.get.invalidate();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to save settings");
    },
  });

  const handleSave = () => {
    updateMutation.mutate({ initialBalance });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-heading">Settings</h1>
        <p className="text-subtitle mt-1">Configure your trading journal preferences</p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
                <Wallet className="h-5 w-5 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-lg font-semibold">Account Balance</CardTitle>
                <CardDescription className="text-subtitle">
                  Set your initial trading account balance
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="initialBalance">Initial Balance ($)</Label>
              <Input
                id="initialBalance"
                type="number"
                step="0.01"
                min="0"
                placeholder="e.g., 10000"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This is your starting account balance. All statistics will be calculated relative to this amount.
              </p>
            </div>

            <Button 
              onClick={handleSave}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg font-semibold">About</CardTitle>
            <CardDescription className="text-subtitle">
              Crypto Trading Journal
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              A minimalist trading journal designed to help you track, review, and analyze your cryptocurrency trades.
            </p>
            <p>
              Record your trades with detailed information, review them with feedback, and monitor your performance through comprehensive statistics.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

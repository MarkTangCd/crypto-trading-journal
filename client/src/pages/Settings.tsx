import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Loader2, Wallet, ArrowRight } from "lucide-react";

export default function Settings() {
  const [, setLocation] = useLocation();
  const { data: settings, isLoading } = trpc.user.getSettings.useQuery();

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
        <p className="text-subtitle mt-1">
          Configure your trading journal preferences
        </p>
      </div>

      <div className="max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg font-semibold">
              <Wallet className="h-5 w-5" />
              Account Management
            </CardTitle>
            <CardDescription className="text-subtitle">
              Manage your trading accounts and initial balances
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Initial balance settings have been moved to the Account Management
              page. You can now create multiple accounts, each with its own
              initial balance and transaction history.
            </p>
            <Button onClick={() => setLocation("/accounts")}>
              Go to Account Management
              <ArrowRight className="ml-2 h-4 w-4" />
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
              A minimalist trading journal designed to help you track, review,
              and analyze your cryptocurrency trades.
            </p>
            <p>
              Record your trades with detailed information, review them with
              feedback, and monitor your performance through comprehensive
              statistics.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

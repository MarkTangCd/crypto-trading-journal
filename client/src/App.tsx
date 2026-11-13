import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Loader2 } from "lucide-react";
import { lazy, Suspense } from "react";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccountProvider } from "./contexts/AccountContext";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import Plans from "./pages/Plans";
import JournalPrototype from "./pages/JournalPrototype";
import Trades from "./pages/Trades";
import TradeDetail from "./pages/TradeDetail";
import Accounts from "./pages/Accounts";
import PreTrade from "./pages/PreTrade";
import Tools from "./pages/Tools";
import PositionSizeCalculator from "./pages/PositionSizeCalculator";
import Settings from "./pages/Settings";

// Lazy so the rich-text editor only loads on the plan detail page.
const PlanDetail = lazy(() => import("./pages/PlanDetail"));

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/goals" component={Goals} />
        <Route path="/plans" component={Plans} />
        <Route path="/plans/:id">
          <Suspense
            fallback={
              <div className="flex items-center justify-center min-h-[400px]">
                <Loader2
                  className="h-6 w-6 animate-spin text-foreground"
                  aria-label="loading"
                />
              </div>
            }
          >
            <PlanDetail />
          </Suspense>
        </Route>
        <Route path="/trades" component={Trades} />
        <Route path="/trades/:id" component={TradeDetail} />
        <Route path="/journal" component={JournalPrototype} />
        <Route path="/journal/:rest*" component={JournalPrototype} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/pre-trade" component={PreTrade} />
        <Route path="/pre-trade/:id" component={PreTrade} />
        <Route path="/tools" component={Tools} />
        <Route path="/tools/position-size" component={PositionSizeCalculator} />
        <Route path="/settings" component={Settings} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </DashboardLayout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AccountProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AccountProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

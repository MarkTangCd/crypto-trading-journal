import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccountProvider } from "./contexts/AccountContext";
import Dashboard from "./pages/Dashboard";
import Goals from "./pages/Goals";
import PlansPrototype from "./pages/PlansPrototype";
import Trades from "./pages/Trades";
import TradeDetail from "./pages/TradeDetail";
import Accounts from "./pages/Accounts";
import PreTrade from "./pages/PreTrade";
import Tools from "./pages/Tools";
import PositionSizeCalculator from "./pages/PositionSizeCalculator";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/goals" component={Goals} />
        <Route path="/plans" component={PlansPrototype} />
        <Route path="/plans/:id" component={PlansPrototype} />
        <Route path="/trades" component={Trades} />
        <Route path="/trades/:id" component={TradeDetail} />
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

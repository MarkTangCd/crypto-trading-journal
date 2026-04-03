import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import DashboardLayout from "./components/DashboardLayout";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccountProvider } from "./contexts/AccountContext";
import Dashboard from "./pages/Dashboard";
import Transactions from "./pages/Transactions";
import NewTransaction from "./pages/NewTransaction";
import TransactionDetail from "./pages/TransactionDetail";
import TradingElements from "./pages/TradingElements";
import TradingSystems from "./pages/TradingSystems";
import Settings from "./pages/Settings";

function Router() {
  return (
    <DashboardLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/transactions/new" component={NewTransaction} />
        <Route path="/transactions/:id" component={TransactionDetail} />
        <Route path="/trading-elements" component={TradingElements} />
        <Route path="/trading-systems" component={TradingSystems} />
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

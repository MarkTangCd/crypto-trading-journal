import { useAccount } from "@/contexts/AccountContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Wallet, Settings } from "lucide-react";
import { useLocation } from "wouter";

export function AccountSwitcher() {
  const [, setLocation] = useLocation();
  const { selectedAccount, setSelectedAccountId, accounts, isLoading } =
    useAccount();

  if (isLoading || !accounts.length) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
        <Wallet className="h-4 w-4" />
        <span>Loading...</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between px-2 py-1.5 h-auto"
        >
          <div className="flex items-center gap-2 overflow-hidden">
            <Wallet className="h-4 w-4 shrink-0" />
            <span className="truncate font-medium">
              {selectedAccount?.name || "Select Account"}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Accounts</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {accounts.map(account => (
          <DropdownMenuItem
            key={account.id}
            onClick={() => setSelectedAccountId(account.id)}
            className="flex items-center justify-between"
          >
            <span className="truncate">{account.name}</span>
            {selectedAccount?.id === account.id && (
              <span className="text-xs text-muted-foreground">✓</span>
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setLocation("/accounts")}>
          <Settings className="mr-2 h-4 w-4" />
          Manage Accounts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

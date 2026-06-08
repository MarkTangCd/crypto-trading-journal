import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { trpc } from "@/lib/trpc";
import type { Account } from "@shared/types";

interface AccountContextValue {
  selectedAccount: Account | null;
  setSelectedAccountId: (id: number) => void;
  accounts: Account[];
  isLoading: boolean;
}

const AccountContext = createContext<AccountContextValue | undefined>(
  undefined
);

const SELECTED_ACCOUNT_ID_KEY = "selectedAccountId";

export function AccountProvider({ children }: { children: ReactNode }) {
  const [selectedAccountId, setSelectedAccountIdState] = useState<
    number | null
  >(null);
  const utils = trpc.useUtils();

  const { data: accounts, isLoading } = trpc.account.list.useQuery();

  // Initialize selected account from localStorage on mount
  useEffect(() => {
    if (accounts && accounts.length > 0) {
      const storedId = localStorage.getItem(SELECTED_ACCOUNT_ID_KEY);
      const parsedId = storedId ? parseInt(storedId, 10) : null;

      // Check if stored ID is valid (exists in accounts list)
      const validAccount = parsedId
        ? accounts.find(a => a.id === parsedId)
        : null;

      if (validAccount) {
        setSelectedAccountIdState(validAccount.id);
      } else {
        // Fall back to first account
        setSelectedAccountIdState(accounts[0].id);
        localStorage.setItem(
          SELECTED_ACCOUNT_ID_KEY,
          accounts[0].id.toString()
        );
      }
    }
  }, [accounts]);

  // Handle account deletion - if selected account is gone, select first remaining
  useEffect(() => {
    if (
      accounts &&
      selectedAccountId &&
      !accounts.find(a => a.id === selectedAccountId)
    ) {
      // Selected account was deleted, fall back to first
      if (accounts.length > 0) {
        setSelectedAccountIdState(accounts[0].id);
        localStorage.setItem(
          SELECTED_ACCOUNT_ID_KEY,
          accounts[0].id.toString()
        );
      }
    }
  }, [accounts, selectedAccountId]);

  const setSelectedAccountId = useCallback(
    (id: number) => {
      setSelectedAccountIdState(id);
      localStorage.setItem(SELECTED_ACCOUNT_ID_KEY, id.toString());

      // Invalidate all account-scoped queries
      utils.account.list.invalidate();
      utils.transaction.list.invalidate();
      utils.stats.get.invalidate();
    },
    [utils]
  );

  const selectedAccount =
    accounts?.find(a => a.id === selectedAccountId) || null;

  return (
    <AccountContext.Provider
      value={{
        selectedAccount,
        setSelectedAccountId,
        accounts: accounts || [],
        isLoading,
      }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (context === undefined) {
    throw new Error("useAccount must be used within an AccountProvider");
  }
  return context;
}

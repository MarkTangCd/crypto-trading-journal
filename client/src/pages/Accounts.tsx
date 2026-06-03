import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAccount } from "@/contexts/AccountContext";
import {
  Field,
  INPUT_CLASS,
  TEXTAREA_CLASS,
  fmtDate,
  fmtMoney,
} from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { Account } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface FormData {
  name: string;
  notes: string;
  initialBalance: string;
}

const EMPTY_FORM: FormData = { name: "", notes: "", initialBalance: "0" };

const NOTES_TEXTAREA_CLASS = cn(TEXTAREA_CLASS, "min-h-[5rem]");

export default function Accounts() {
  const utils = trpc.useUtils();
  const { accounts, isLoading, selectedAccount, setSelectedAccountId } =
    useAccount();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);

  const createMutation = trpc.account.create.useMutation({
    onSuccess: () => {
      toast.success("account created");
      utils.account.list.invalidate();
      setIsCreateOpen(false);
      setFormData(EMPTY_FORM);
    },
    onError: error => {
      toast.error(error.message || "failed to create account");
    },
  });

  const updateMutation = trpc.account.update.useMutation({
    onSuccess: () => {
      toast.success("account updated");
      utils.account.list.invalidate();
      setEditingAccount(null);
    },
    onError: error => {
      toast.error(error.message || "failed to update account");
    },
  });

  const deleteMutation = trpc.account.delete.useMutation({
    onSuccess: () => {
      toast.success("account deleted");
      utils.account.list.invalidate();
      utils.transaction.list.invalidate();
      utils.stats.get.invalidate();
      setDeletingAccount(null);
    },
    onError: error => {
      toast.error(error.message || "failed to delete account");
    },
  });

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setIsCreateOpen(true);
  };

  const openEdit = (account: Account) => {
    setFormData({
      name: account.name,
      notes: account.notes || "",
      initialBalance: account.initialBalance,
    });
    setEditingAccount(account);
  };

  const handleCreate = () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast.error("name is required");
      return;
    }
    createMutation.mutate({
      name: trimmedName,
      notes: formData.notes || undefined,
      initialBalance: formData.initialBalance || "0",
    });
  };

  const handleUpdate = () => {
    if (!editingAccount) return;
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast.error("name is required");
      return;
    }
    updateMutation.mutate({
      id: editingAccount.id,
      name: trimmedName,
      notes: formData.notes || undefined,
      initialBalance: formData.initialBalance || "0",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <h1 className="sr-only">Accounts</h1>

      <header className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-title">accounts</p>
          <p className="text-label">switch · create · edit · archive</p>
        </div>
        <Button variant="outline" onClick={openCreate}>
          new account
        </Button>
      </header>

      {accounts.length === 0 ? (
        <section className="border-t border-border pt-16 text-center">
          <p>no accounts.</p>
          <p className="text-sm text-muted-foreground mt-2">
            create one to start logging trades.
          </p>
          <Button variant="outline" className="mt-6" onClick={openCreate}>
            create account
          </Button>
        </section>
      ) : (
        <section aria-label="accounts" className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 pr-4 text-left text-label font-normal">
                  name
                </th>
                <th className="py-3 px-4 text-right text-label font-normal">
                  initial
                </th>
                <th className="py-3 px-4 text-left text-label font-normal">
                  notes
                </th>
                <th className="py-3 px-4 text-left text-label font-normal whitespace-nowrap">
                  created
                </th>
                <th
                  className="py-3 pl-4 text-right text-label font-normal"
                  aria-label="actions"
                />
              </tr>
            </thead>
            <tbody>
              {accounts.map(account => {
                const isActive = selectedAccount?.id === account.id;
                const canDelete = accounts.length > 1;
                return (
                  <tr
                    key={account.id}
                    className="border-b border-border last:border-b-0 align-top"
                  >
                    <td className="py-4 pr-4 min-w-[10rem]">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span
                          className={cn(
                            "font-medium text-foreground",
                            isActive && "underline underline-offset-4"
                          )}
                        >
                          {account.name}
                        </span>
                        {isActive && (
                          <span className="text-label">[active]</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-4 text-right whitespace-nowrap">
                      ${fmtMoney(account.initialBalance)}
                    </td>
                    <td className="py-4 px-4 text-muted-foreground max-w-[20rem]">
                      {account.notes ? (
                        <span className="line-clamp-2">{account.notes}</span>
                      ) : (
                        <span aria-hidden="true">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 whitespace-nowrap text-muted-foreground">
                      {fmtDate(account.createdAt)}
                    </td>
                    <td className="py-4 pl-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-3">
                        {!isActive && (
                          <button
                            type="button"
                            onClick={() => setSelectedAccountId(account.id)}
                            className="hover:text-foreground transition-colors"
                          >
                            select →
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEdit(account)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                        >
                          edit
                        </button>
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => setDeletingAccount(account)}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                          >
                            del
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Create */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>new account</DialogTitle>
            <DialogDescription>
              a separate ledger with its own balance and trades.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <Field label="name" htmlFor="create-name">
              <input
                id="create-name"
                type="text"
                placeholder="main · swing · scalp"
                value={formData.name}
                onChange={e => updateField("name", e.target.value)}
                className={INPUT_CLASS}
                autoFocus
              />
            </Field>
            <Field label="initial balance" htmlFor="create-balance">
              <input
                id="create-balance"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.initialBalance}
                onChange={e => updateField("initialBalance", e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="notes (optional)" htmlFor="create-notes">
              <textarea
                id="create-notes"
                rows={3}
                placeholder="why this account exists, what it's for."
                value={formData.notes}
                onChange={e => updateField("notes", e.target.value)}
                className={NOTES_TEXTAREA_CLASS}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCreateOpen(false)}
            >
              cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createMutation.isPending || !formData.name.trim()}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "create"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog
        open={editingAccount !== null}
        onOpenChange={open => !open && setEditingAccount(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>edit account</DialogTitle>
            <DialogDescription>
              changes apply to all stats computed from this account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <Field label="name" htmlFor="edit-name">
              <input
                id="edit-name"
                type="text"
                value={formData.name}
                onChange={e => updateField("name", e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="initial balance" htmlFor="edit-balance">
              <input
                id="edit-balance"
                type="text"
                inputMode="decimal"
                value={formData.initialBalance}
                onChange={e => updateField("initialBalance", e.target.value)}
                className={INPUT_CLASS}
              />
            </Field>
            <Field label="notes (optional)" htmlFor="edit-notes">
              <textarea
                id="edit-notes"
                rows={3}
                value={formData.notes}
                onChange={e => updateField("notes", e.target.value)}
                className={NOTES_TEXTAREA_CLASS}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditingAccount(null)}
            >
              cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formData.name.trim()}
            >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog
        open={deletingAccount !== null}
        onOpenChange={open => !open && setDeletingAccount(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete account?</AlertDialogTitle>
            <AlertDialogDescription>
              this removes &quot;{deletingAccount?.name}&quot; and every trade
              logged against it. it can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deletingAccount &&
                deleteMutation.mutate({ id: deletingAccount.id })
              }
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useAccount } from "@/contexts/AccountContext";
import { format } from "date-fns";
import {
  Plus,
  Edit2,
  Trash2,
  Wallet,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

export default function Accounts() {
  const utils = trpc.useUtils();
  const { accounts, isLoading, selectedAccount, setSelectedAccountId } =
    useAccount();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<
    (typeof accounts)[0] | null
  >(null);
  const [deletingAccount, setDeletingAccount] = useState<
    (typeof accounts)[0] | null
  >(null);

  const [formData, setFormData] = useState({
    name: "",
    notes: "",
    initialBalance: "0",
  });

  const createMutation = trpc.account.create.useMutation({
    onSuccess: () => {
      toast.success("Account created successfully");
      utils.account.list.invalidate();
      setIsCreateOpen(false);
      setFormData({ name: "", notes: "", initialBalance: "0" });
    },
    onError: error => {
      toast.error(error.message || "Failed to create account");
    },
  });

  const updateMutation = trpc.account.update.useMutation({
    onSuccess: () => {
      toast.success("Account updated successfully");
      utils.account.list.invalidate();
      setIsEditOpen(false);
      setEditingAccount(null);
    },
    onError: error => {
      toast.error(error.message || "Failed to update account");
    },
  });

  const deleteMutation = trpc.account.delete.useMutation({
    onSuccess: () => {
      toast.success("Account deleted successfully");
      utils.account.list.invalidate();
      utils.transaction.list.invalidate();
      utils.stats.get.invalidate();
      setIsDeleteOpen(false);
      setDeletingAccount(null);
    },
    onError: error => {
      toast.error(error.message || "Failed to delete account");
    },
  });

  const handleCreate = () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast.error("Account name is required");
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
      toast.error("Account name is required");
      return;
    }
    updateMutation.mutate({
      id: editingAccount.id,
      name: trimmedName,
      notes: formData.notes || undefined,
      initialBalance: formData.initialBalance || "0",
    });
  };

  const handleDelete = () => {
    if (!deletingAccount) return;
    deleteMutation.mutate({ id: deletingAccount.id });
  };

  const openEditDialog = (account: (typeof accounts)[0]) => {
    setEditingAccount(account);
    setFormData({
      name: account.name,
      notes: account.notes || "",
      initialBalance: account.initialBalance,
    });
    setIsEditOpen(true);
  };

  const openDeleteDialog = (account: (typeof accounts)[0]) => {
    if (accounts.length <= 1) {
      toast.error("Cannot delete the last remaining account");
      return;
    }
    setDeletingAccount(account);
    setIsDeleteOpen(true);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-heading">Account Management</h1>
          <p className="text-subtitle mt-1">
            Manage your trading accounts and their settings
          </p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Account</DialogTitle>
              <DialogDescription>
                Create a new trading account with its own balance and
                transactions.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Account Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Main Account, Swing Trading"
                  value={formData.name}
                  onChange={e =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="initialBalance">Initial Balance</Label>
                <Input
                  id="initialBalance"
                  type="text"
                  placeholder="0.00"
                  value={formData.initialBalance}
                  onChange={e =>
                    setFormData({ ...formData, initialBalance: e.target.value })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Starting balance for this account. All statistics will be
                  calculated relative to this amount.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Optional notes about this account..."
                  value={formData.notes}
                  onChange={e =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={createMutation.isPending || !formData.name.trim()}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  "Create Account"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {accounts.map(account => (
          <Card
            key={account.id}
            className={
              selectedAccount?.id === account.id ? "border-primary" : ""
            }
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-muted-foreground" />
                  <CardTitle className="text-lg">{account.name}</CardTitle>
                </div>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEditDialog(account)}
                  >
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => openDeleteDialog(account)}
                    disabled={accounts.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <CardDescription>
                Created {format(account.createdAt, "MMM d, yyyy")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Initial Balance
                </span>
                <span className="font-medium">${account.initialBalance}</span>
              </div>
              {account.notes && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {account.notes}
                </p>
              )}
              {selectedAccount?.id === account.id && (
                <div className="flex items-center gap-1 text-xs text-primary">
                  <AlertCircle className="h-3 w-3" />
                  Currently selected
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
            <DialogDescription>Update account settings.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Account Name *</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={e =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-initialBalance">Initial Balance</Label>
              <Input
                id="edit-initialBalance"
                type="text"
                value={formData.initialBalance}
                onChange={e =>
                  setFormData({ ...formData, initialBalance: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={formData.notes}
                onChange={e =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updateMutation.isPending || !formData.name.trim()}
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingAccount?.name}
              &quot;? This will also delete all transactions associated with
              this account. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setIsDeleteOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                "Delete Account"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

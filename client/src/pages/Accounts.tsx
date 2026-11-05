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
import { SyncLine } from "@/components/sync/SyncLine";
import { useAccount } from "@/contexts/AccountContext";
import { useSyncAccount } from "@/hooks/useSyncAccount";
import {
  Field,
  INPUT_CLASS,
  SectionHeader,
  TEXTAREA_CLASS,
  fmtDate,
  fmtDuration,
  fmtMoney,
} from "@/lib/ledger";
import { isSyncErrorCode, SYNC_ERROR_REASONS } from "@/lib/syncErrors";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import type { PublicAccount } from "@shared/types";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface KeyValues {
  apiKey: string;
  apiSecret: string;
}

interface LinkValues extends KeyValues {
  name: string;
  notes: string;
}

const EMPTY_KEYS: KeyValues = { apiKey: "", apiSecret: "" };
const EMPTY_LINK: LinkValues = { ...EMPTY_KEYS, name: "", notes: "" };

const NOTES_TEXTAREA_CLASS = cn(TEXTAREA_CLASS, "min-h-[5rem]");

/**
 * Split a mutation error into an inline key-rejection sentence (sync error
 * code) or a toast for anything else.
 */
function keyRejection(message: string): string | null {
  if (isSyncErrorCode(message)) return SYNC_ERROR_REASONS[message];
  toast.error(message || "request failed");
  return null;
}

export default function Accounts() {
  const { accounts, isLoading, selectedAccount, setSelectedAccountId } =
    useAccount();

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

  if (accounts.length === 0 || !selectedAccount) {
    return (
      <div className="space-y-10">
        <h1 className="sr-only">Accounts</h1>
        <header className="space-y-2">
          <p className="text-title">link an account</p>
          <p className="text-sm text-muted-foreground max-w-xl">
            trades come from the exchange: link a read-only binance futures key
            and the journal backfills the last 30 days.
          </p>
        </header>
        <LinkForm />
      </div>
    );
  }

  const others = accounts.filter(a => a.id !== selectedAccount.id);

  return (
    <div className="space-y-16">
      <h1 className="sr-only">Accounts</h1>
      <AccountDossier
        account={selectedAccount}
        canUnlink={accounts.length > 1}
      />

      {others.length > 0 && (
        <section aria-label="other accounts" className="space-y-4">
          <SectionHeader>other accounts</SectionHeader>
          <ul className="space-y-3">
            {others.map(account => (
              <li
                key={account.id}
                className="flex items-baseline justify-between gap-4 flex-wrap text-sm"
              >
                <span className="font-medium">
                  {account.name}{" "}
                  {account.apiKeyTail && (
                    <span className="text-label">····{account.apiKeyTail}</span>
                  )}
                </span>
                <span className="text-label">
                  {shortSyncState(account)} ·{" "}
                  <button
                    type="button"
                    onClick={() => setSelectedAccountId(account.id)}
                    className="underline underline-offset-4 hover:text-foreground transition-colors"
                  >
                    select →
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="link another account" className="space-y-6">
        <SectionHeader>link another account</SectionHeader>
        <LinkForm />
      </section>
    </div>
  );
}

function shortSyncState(account: PublicAccount): string {
  if (account.lastSyncErrorCode !== null) return "! sync failed";
  if (account.lastSyncedAt === null) return "never synced";
  return `synced ${fmtDuration(account.lastSyncedAt, Date.now())} ago`;
}

function AccountDossier({
  account,
  canUnlink,
}: {
  account: PublicAccount;
  canUnlink: boolean;
}) {
  const utils = trpc.useUtils();
  const sync = useSyncAccount();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isReplaceOpen, setIsReplaceOpen] = useState(false);
  const [isUnlinkOpen, setIsUnlinkOpen] = useState(false);

  const deleteMutation = trpc.account.delete.useMutation({
    onSuccess: () => {
      toast.success("account unlinked");
      utils.account.list.invalidate();
      utils.trade.invalidate();
      utils.stats.invalidate();
      setIsUnlinkOpen(false);
    },
    onError: error => {
      toast.error(error.message || "failed to unlink account");
    },
  });

  return (
    <article aria-label={`account ${account.name}`} className="space-y-16">
      <header className="space-y-2">
        <p className="text-title">{account.name}</p>
        <p className="text-label">
          binance usdⓈ-m
          {account.apiKeyTail && <> · key ····{account.apiKeyTail}</>}
          {account.keyVerifiedAt !== null && (
            <> · read-only verified {fmtDate(account.keyVerifiedAt)}</>
          )}
        </p>
      </header>

      <section aria-label="wallet balance">
        <p className="text-label">wallet balance</p>
        {/* Not cn(): tailwind-merge drops text-display next to a text-* color. */}
        <p
          className={`text-display mt-2 ${account.balanceUsdt === null ? "text-muted-foreground" : ""}`}
        >
          {account.balanceUsdt === null
            ? "—"
            : `$${fmtMoney(account.balanceUsdt)}`}
        </p>
        <div className="mt-4">
          <SyncLine
            account={account}
            onSync={() => sync.mutate({ id: account.id })}
            isSyncing={sync.isPending}
          />
        </div>
      </section>

      <section className="space-y-3 text-sm max-w-xl">
        {account.notes && <p>{account.notes}</p>}
        <p className="text-label">
          linked {fmtDate(account.createdAt)} ·{" "}
          {account.backfillStart === null
            ? "not backfilled yet"
            : `backfilled from ${fmtDate(account.backfillStart)}`}
        </p>
        <div className="flex gap-6 flex-wrap text-label pt-2">
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="hover:text-foreground transition-colors"
          >
            edit
          </button>
          <button
            type="button"
            onClick={() => setIsReplaceOpen(true)}
            className="hover:text-foreground transition-colors"
          >
            replace key
          </button>
          {canUnlink && (
            <button
              type="button"
              onClick={() => setIsUnlinkOpen(true)}
              className="hover:text-foreground transition-colors"
            >
              unlink · deletes its trades
            </button>
          )}
        </div>
      </section>

      {/* Keyed by account so switching accounts resets the drafts. */}
      <EditDialog
        key={`edit-${account.id}-${isEditOpen}`}
        account={account}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
      />
      <ReplaceKeyDialog
        key={`replace-${account.id}-${isReplaceOpen}`}
        account={account}
        open={isReplaceOpen}
        onOpenChange={setIsReplaceOpen}
      />

      <AlertDialog open={isUnlinkOpen} onOpenChange={setIsUnlinkOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>unlink {account.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              this deletes the account, every trade synced into it and the ai
              review conversations on those trades. the binance key itself is
              untouched. it can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate({ id: account.id })}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "unlink"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  );
}

/** api key + api secret, with the key-rejection sentence under the secret. */
function KeyFields({
  idPrefix,
  values,
  onChange,
  rejection,
}: {
  idPrefix: string;
  values: KeyValues;
  onChange: (values: KeyValues) => void;
  rejection: string | null;
}) {
  const errorId = `${idPrefix}-key-error`;
  return (
    <>
      <Field label="api key" htmlFor={`${idPrefix}-api-key`}>
        <input
          id={`${idPrefix}-api-key`}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={values.apiKey}
          onChange={e => onChange({ ...values, apiKey: e.target.value })}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="api secret" htmlFor={`${idPrefix}-api-secret`}>
        <input
          id={`${idPrefix}-api-secret`}
          type="password"
          autoComplete="off"
          placeholder="stored encrypted; never shown again"
          value={values.apiSecret}
          onChange={e => onChange({ ...values, apiSecret: e.target.value })}
          className={INPUT_CLASS}
          aria-invalid={rejection !== null}
          aria-describedby={rejection ? errorId : undefined}
        />
        {rejection && (
          <p id={errorId} role="alert" className="text-sm text-foreground">
            ! {rejection}
          </p>
        )}
      </Field>
    </>
  );
}

const hasKeys = (values: KeyValues) =>
  values.apiKey.trim() !== "" && values.apiSecret.trim() !== "";

function LinkForm() {
  const utils = trpc.useUtils();
  const { setSelectedAccountId } = useAccount();
  const sync = useSyncAccount();
  const [values, setValues] = useState<LinkValues>(EMPTY_LINK);
  const [rejection, setRejection] = useState<string | null>(null);

  const createMutation = trpc.account.create.useMutation({
    onSuccess: async account => {
      toast.success("account linked");
      setValues(EMPTY_LINK);
      // Refetch before selecting: AccountContext falls back to the first
      // account when the selected id is not in the cached list.
      await utils.account.list.invalidate();
      setSelectedAccountId(account.id);
      sync.mutate({ id: account.id });
    },
    onError: error => setRejection(keyRejection(error.message)),
  });

  const canSubmit =
    values.name.trim() !== "" && hasKeys(values) && !createMutation.isPending;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setRejection(null);
    createMutation.mutate({
      name: values.name.trim(),
      exchange: "binance",
      apiKey: values.apiKey,
      apiSecret: values.apiSecret,
      notes: values.notes || undefined,
    });
  };

  return (
    <form
      onSubmit={event => {
        event.preventDefault();
        handleSubmit();
      }}
      className="space-y-6 max-w-md"
    >
      <Field label="name" htmlFor="link-name">
        <input
          id="link-name"
          type="text"
          placeholder="main · swing · scalp"
          value={values.name}
          onChange={e => setValues({ ...values, name: e.target.value })}
          className={INPUT_CLASS}
        />
      </Field>
      <Field label="exchange" htmlFor="link-exchange">
        <input
          id="link-exchange"
          type="text"
          value="binance usdⓈ-m futures"
          readOnly
          className={cn(INPUT_CLASS, "text-muted-foreground")}
        />
      </Field>
      <KeyFields
        idPrefix="link"
        values={values}
        onChange={keys => setValues({ ...values, ...keys })}
        rejection={rejection}
      />
      <Field label="notes (optional)" htmlFor="link-notes">
        <textarea
          id="link-notes"
          rows={2}
          placeholder="why this account exists."
          value={values.notes}
          onChange={e => setValues({ ...values, notes: e.target.value })}
          className={NOTES_TEXTAREA_CLASS}
        />
      </Field>
      <div className="flex gap-4 items-center flex-wrap">
        <Button type="submit" disabled={!canSubmit}>
          {createMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "link account"
          )}
        </Button>
        <p className="text-label">
          verifies permissions, then backfills 30 days
        </p>
      </div>
    </form>
  );
}

function EditDialog({
  account,
  open,
  onOpenChange,
}: {
  account: PublicAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(account.name);
  const [notes, setNotes] = useState(account.notes ?? "");

  const updateMutation = trpc.account.update.useMutation({
    onSuccess: () => {
      toast.success("account updated");
      utils.account.invalidate();
      onOpenChange(false);
    },
    onError: error => {
      toast.error(error.message || "failed to update account");
    },
  });

  const handleSave = () => {
    if (!name.trim()) return;
    updateMutation.mutate({ id: account.id, name: name.trim(), notes });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>edit account</DialogTitle>
          <DialogDescription>name and notes only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <Field label="name" htmlFor="edit-name">
            <input
              id="edit-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="notes (optional)" htmlFor="edit-notes">
            <textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className={NOTES_TEXTAREA_CLASS}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !name.trim()}
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
  );
}

function ReplaceKeyDialog({
  account,
  open,
  onOpenChange,
}: {
  account: PublicAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const [keys, setKeys] = useState<KeyValues>(EMPTY_KEYS);
  const [rejection, setRejection] = useState<string | null>(null);

  const replaceMutation = trpc.account.replaceKey.useMutation({
    onSuccess: () => {
      toast.success("api key replaced");
      utils.account.invalidate();
      onOpenChange(false);
    },
    onError: error => setRejection(keyRejection(error.message)),
  });

  const handleReplace = () => {
    if (!hasKeys(keys)) return;
    setRejection(null);
    replaceMutation.mutate({ id: account.id, ...keys });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>replace api key</DialogTitle>
          <DialogDescription>
            the new key is verified before it replaces ····
            {account.apiKeyTail ?? "—"}. synced trades stay as they are.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <KeyFields
            idPrefix="replace"
            values={keys}
            onChange={setKeys}
            rejection={rejection}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            cancel
          </Button>
          <Button
            onClick={handleReplace}
            disabled={replaceMutation.isPending || !hasKeys(keys)}
          >
            {replaceMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "replace"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { fmtDateTime, fmtDuration } from "@/lib/ledger";
import { syncErrorReason } from "@/lib/syncErrors";
import type { PublicAccount } from "@shared/types";

const ago = (ts: number) => `${fmtDuration(ts, Date.now())} ago`;

// The one place the sync state is spelled out. Failure is ink, never a
// signal hue (One-Signal Rule).
export function SyncLine({
  account,
  onSync,
  isSyncing,
}: {
  account: PublicAccount;
  onSync: () => void;
  isSyncing: boolean;
}) {
  const action = (label: string) =>
    isSyncing ? (
      <span>syncing…</span>
    ) : (
      <button
        type="button"
        onClick={onSync}
        className="underline underline-offset-4 hover:text-foreground transition-colors"
      >
        {label}
      </button>
    );

  if (account.lastSyncErrorCode !== null) {
    const failedAt = account.lastSyncAttemptAt;
    return (
      <div className="space-y-1">
        <p className="text-sm text-foreground">
          ! sync failed{failedAt !== null && ` ${ago(failedAt)}`} —{" "}
          {syncErrorReason(account.lastSyncErrorCode) ??
            account.lastSyncErrorCode}
        </p>
        <p className="text-label">
          last successful sync{" "}
          {account.lastSyncedAt === null
            ? "never"
            : fmtDateTime(account.lastSyncedAt)}{" "}
          · {action("retry")}
        </p>
      </div>
    );
  }

  if (account.lastSyncedAt === null) {
    return <p className="text-label">never synced · {action("sync now")}</p>;
  }

  return (
    <p className="text-label">
      synced {ago(account.lastSyncedAt)} · {action("sync now")}
    </p>
  );
}

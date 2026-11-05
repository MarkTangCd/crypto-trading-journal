import { syncErrorReason } from "@/lib/syncErrors";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

/** account.sync with the shared cache refresh and toasts. */
export function useSyncAccount() {
  const utils = trpc.useUtils();

  return trpc.account.sync.useMutation({
    onSuccess: () => {
      utils.account.invalidate();
      utils.trade.invalidate();
      utils.stats.invalidate();
    },
    onError: error => {
      if (error.data?.code === "CONFLICT") {
        toast("同步进行中");
        return;
      }
      // The failure is persisted on the account; refetch so SyncLine shows it.
      utils.account.invalidate();
      toast.error(syncErrorReason(error.message) ?? error.message);
    },
  });
}

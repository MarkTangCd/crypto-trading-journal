import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type ProviderId = "deepseek" | "kimi" | "glm" | "openai" | "gemini";

export function DefaultProviderSection() {
  const utils = trpc.useUtils();
  const providersQuery = trpc.settings.listProviders.useQuery();
  const defaultQuery = trpc.settings.getDefaultProvider.useQuery();

  const setMutation = trpc.settings.setDefaultProvider.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`默认 provider 已切到 ${variables.providerId}`);
      utils.settings.getDefaultProvider.invalidate();
    },
    onError: error => {
      toast.error(error.message || "切换失败");
    },
  });

  if (providersQuery.isLoading || defaultQuery.isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const providers = (providersQuery.data ?? []).filter(p => p.hasKey);
  const currentDefault = defaultQuery.data?.defaultProvider ?? "deepseek";

  if (providers.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">默认 provider</p>
        <p className="text-sm text-muted-foreground">
          请先在下方任意一家 provider 填入 api key，才能选为默认。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">默认 provider</p>
        <p className="text-sm text-muted-foreground">
          新开一笔复盘对话时使用的 provider。已开过的对话仍走自己当初的
          provider。
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label="默认 provider"
        className="flex flex-wrap gap-2"
      >
        {providers.map(meta => {
          const selected = meta.id === currentDefault;
          const isSaving =
            setMutation.isPending &&
            setMutation.variables?.providerId === meta.id;
          return (
            <button
              key={meta.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={selected || setMutation.isPending}
              onClick={() =>
                setMutation.mutate({ providerId: meta.id as ProviderId })
              }
              className={cn(
                "px-3 py-1.5 text-label border transition-colors",
                "lowercase tabular-nums",
                selected
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
              )}
            >
              {isSaving ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                meta.label
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

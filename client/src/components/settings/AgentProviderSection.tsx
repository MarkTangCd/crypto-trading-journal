import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { trpc } from "@/lib/trpc";
import { ProviderRow } from "./ProviderRow";

interface Draft {
  apiKey: string;
  baseUrl: string;
}

type DraftMap = Record<string, Draft>;

// Provider id union matches the server's z.enum on `providerIdSchema`.
// We cast at the mutation boundary so the trpc client stays type-checked
// against the registered ids.
type ProviderId = "deepseek" | "kimi" | "glm" | "openai" | "gemini";

export function AgentProviderSection() {
  const utils = trpc.useUtils();
  const providersQuery = trpc.settings.listProviders.useQuery();
  const [drafts, setDrafts] = useState<DraftMap>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const setMutation = trpc.settings.setProviderConfig.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`已保存 ${variables.providerId} 配置`);
      utils.settings.listProviders.invalidate();
      setDrafts(prev => ({
        ...prev,
        [variables.providerId]: { apiKey: "", baseUrl: "" },
      }));
    },
    onError: error => {
      toast.error(error.message || "保存失败");
    },
    onSettled: () => {
      setSavingId(null);
    },
  });

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts(prev => ({
      ...prev,
      [id]: {
        apiKey: prev[id]?.apiKey ?? "",
        baseUrl: prev[id]?.baseUrl ?? "",
        ...patch,
      },
    }));
  };

  const handleSave = (
    id: string,
    hasKey: boolean,
    configuredBaseUrl: string
  ) => {
    const draft = drafts[id] ?? { apiKey: "", baseUrl: "" };
    const trimmedKey = draft.apiKey.trim();
    if (!trimmedKey && !hasKey) {
      toast.error("api key 不能为空");
      return;
    }
    // Fall back to the persisted baseUrl when the draft is untouched so the
    // user can save a key without re-typing a custom proxy URL.
    const nextBaseUrl = draft.baseUrl.trim() || configuredBaseUrl;
    setSavingId(id);
    setMutation.mutate({
      providerId: id as ProviderId,
      apiKey: trimmedKey || undefined,
      baseUrl: nextBaseUrl || undefined,
    });
  };

  if (providersQuery.isLoading) {
    return (
      <section className="border-y border-border py-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const providers = providersQuery.data ?? [];

  return (
    <section className="border-y border-border py-5 space-y-5">
      <div className="space-y-1">
        <p className="font-medium text-foreground">AI 复盘助手</p>
        <p className="text-sm text-muted-foreground">
          为任意一家 provider 配置 api key 后，可在 Transactions 详情页打开 AI
          复盘对话。密钥本地 AES-GCM 加密，永远不会通过 api 回传。
        </p>
      </div>

      <div className="space-y-5">
        {providers.map(meta => {
          const draft = drafts[meta.id] ?? { apiKey: "", baseUrl: "" };
          // Show the persisted custom baseUrl as the input value when the
          // user hasn't typed anything yet; once they edit, the draft wins.
          const baseUrlValue =
            drafts[meta.id]?.baseUrl !== undefined
              ? draft.baseUrl
              : (meta.configuredBaseUrl ?? "");
          return (
            <ProviderRow
              key={meta.id}
              id={meta.id}
              label={meta.label}
              defaultBaseUrl={meta.defaultBaseUrl}
              defaultModel={meta.defaultModel}
              hasKey={meta.hasKey}
              apiKeyDraft={draft.apiKey}
              baseUrlDraft={baseUrlValue}
              isSaving={savingId === meta.id && setMutation.isPending}
              onApiKeyChange={value => updateDraft(meta.id, { apiKey: value })}
              onBaseUrlChange={value =>
                updateDraft(meta.id, { baseUrl: value })
              }
              onSave={() =>
                handleSave(meta.id, meta.hasKey, meta.configuredBaseUrl ?? "")
              }
            />
          );
        })}
      </div>
    </section>
  );
}

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const PROVIDER_OPTIONS = [
  {
    id: "deepseek" as const,
    label: "deepseek",
    defaultBaseUrl: "https://api.deepseek.com",
  },
];

type ProviderId = (typeof PROVIDER_OPTIONS)[number]["id"];

export function AgentProviderSection() {
  const [providerId, setProviderId] = useState<ProviderId>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");

  const utils = trpc.useUtils();

  const configQuery = trpc.settings.getProviderConfig.useQuery({ providerId });
  const setMutation = trpc.settings.setProviderConfig.useMutation({
    onSuccess: () => {
      toast.success("已保存 deepseek 配置");
      utils.settings.getProviderConfig.invalidate({ providerId });
      setApiKey("");
    },
    onError: error => {
      toast.error(error.message || "保存失败");
    },
  });

  const currentProvider = useMemo(
    () => PROVIDER_OPTIONS.find(option => option.id === providerId)!,
    [providerId]
  );

  useEffect(() => {
    if (configQuery.data) {
      setBaseUrl(configQuery.data.baseUrl ?? "");
    }
  }, [configQuery.data]);

  const hasKey = configQuery.data?.hasKey ?? false;
  const status = configQuery.isLoading
    ? "loading"
    : hasKey
      ? "configured"
      : "missing";

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!apiKey.trim() && !hasKey) {
      toast.error("api key 不能为空");
      return;
    }
    setMutation.mutate({
      providerId,
      apiKey: apiKey.trim() || undefined,
      baseUrl: baseUrl.trim() || undefined,
    });
  };

  return (
    <section className="border-y border-border py-5 space-y-5">
      <div className="space-y-1">
        <p className="font-medium text-foreground">AI 复盘助手</p>
        <p className="text-sm text-muted-foreground">
          配置 deepseek api key 后，可在 Transactions 详情页打开 AI
          复盘对话。密钥本地 AES-GCM 加密，永远不会通过 api 回传。
        </p>
      </div>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
          <Label htmlFor="agent-provider" className="text-label pt-2">
            provider
          </Label>
          <select
            id="agent-provider"
            value={providerId}
            onChange={event => setProviderId(event.target.value as ProviderId)}
            className="border-b border-input bg-transparent py-2 text-sm focus:outline-none focus:border-foreground"
          >
            {PROVIDER_OPTIONS.map(option => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
          <Label htmlFor="agent-api-key" className="text-label pt-2">
            api key
          </Label>
          <div className="space-y-1">
            <Input
              id="agent-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={hasKey ? "已配置（留空则保留现有 key）" : "sk-..."}
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              输入新值会覆盖旧 key；留空表示保留现有 key、只更新其他字段。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
          <Label htmlFor="agent-base-url" className="text-label pt-2">
            base url
          </Label>
          <div className="space-y-1">
            <Input
              id="agent-base-url"
              type="url"
              placeholder={currentProvider.defaultBaseUrl}
              value={baseUrl}
              onChange={event => setBaseUrl(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              可选，留空走官方地址。需要走代理时填写自定义地址。
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 pt-2">
          <span
            className={cn(
              "text-label",
              status === "configured" && "status-win",
              status === "missing" && "status-loss"
            )}
          >
            {status === "loading"
              ? "加载中…"
              : status === "configured"
                ? "已配置"
                : "未配置"}
          </span>
          <Button type="submit" disabled={setMutation.isPending}>
            {setMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "保存"
            )}
          </Button>
        </div>
      </form>
    </section>
  );
}

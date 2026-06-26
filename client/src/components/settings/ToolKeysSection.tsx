import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

type ToolId = "tavily";

interface ToolMeta {
  id: ToolId;
  label: string;
  description: string;
  placeholder: string;
}

const TOOLS: ToolMeta[] = [
  {
    id: "tavily",
    label: "tavily search · api key",
    description:
      "为 web_search 工具配置 tavily api key 后，复盘 agent 才能上网查 funding rate 新闻、宏观叙事等。密钥本地 AES-GCM 加密。",
    placeholder: "tvly-...",
  },
];

export function ToolKeysSection() {
  const utils = trpc.useUtils();
  const statusQuery = trpc.settings.getToolKeyStatus.useQuery();
  const [drafts, setDrafts] = useState<Record<ToolId, string>>({ tavily: "" });
  const [savingId, setSavingId] = useState<ToolId | null>(null);

  const setMutation = trpc.settings.setToolKey.useMutation({
    onSuccess: (_data, variables) => {
      toast.success(`已保存 ${variables.tool} api key`);
      utils.settings.getToolKeyStatus.invalidate();
      setDrafts(prev => ({ ...prev, [variables.tool]: "" }));
    },
    onError: error => {
      toast.error(error.message || "保存失败");
    },
    onSettled: () => {
      setSavingId(null);
    },
  });

  const handleSave = (tool: ToolId) => {
    const trimmed = drafts[tool].trim();
    if (!trimmed) {
      toast.error("api key 不能为空");
      return;
    }
    setSavingId(tool);
    setMutation.mutate({ tool, apiKey: trimmed });
  };

  if (statusQuery.isLoading) {
    return (
      <section className="border-y border-border py-5">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const status = statusQuery.data ?? { tavily: { hasKey: false } };

  return (
    <section className="border-y border-border py-5 space-y-5">
      <div className="space-y-1">
        <p className="font-medium text-foreground">外部工具 api keys</p>
        <p className="text-sm text-muted-foreground">
          可选。配置后 review-agent 才能调用对应的外部工具。
        </p>
      </div>

      <div className="space-y-5">
        {TOOLS.map(tool => {
          const hasKey = status[tool.id]?.hasKey ?? false;
          const inputId = `tool-${tool.id}-api-key`;
          const isSaving = savingId === tool.id && setMutation.isPending;
          return (
            <form
              key={tool.id}
              className="space-y-3 border-t border-border pt-5 first:border-t-0 first:pt-0"
              onSubmit={event => {
                event.preventDefault();
                handleSave(tool.id);
              }}
            >
              <div className="flex items-baseline justify-between gap-4">
                <p className="font-medium text-foreground">{tool.label}</p>
                <span
                  className={cn(
                    "text-label",
                    hasKey ? "status-win" : "text-muted-foreground"
                  )}
                >
                  {hasKey ? "已配置" : "未配置"}
                </span>
              </div>

              <p className="text-sm text-muted-foreground">
                {tool.description}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
                <Label htmlFor={inputId} className="text-label pt-2">
                  api key
                </Label>
                <Input
                  id={inputId}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={
                    hasKey ? "已配置（留空则保留现有 key）" : tool.placeholder
                  }
                  value={drafts[tool.id]}
                  onChange={event =>
                    setDrafts(prev => ({
                      ...prev,
                      [tool.id]: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    "保存"
                  )}
                </Button>
              </div>
            </form>
          );
        })}
      </div>
    </section>
  );
}

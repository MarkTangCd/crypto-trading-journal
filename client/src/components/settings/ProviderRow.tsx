import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

export interface ProviderRowProps {
  id: string;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  hasKey: boolean;
  apiKeyDraft: string;
  baseUrlDraft: string;
  isSaving: boolean;
  onApiKeyChange: (value: string) => void;
  onBaseUrlChange: (value: string) => void;
  onSave: () => void;
}

export function ProviderRow(props: ProviderRowProps) {
  const {
    id,
    label,
    defaultBaseUrl,
    defaultModel,
    hasKey,
    apiKeyDraft,
    baseUrlDraft,
    isSaving,
    onApiKeyChange,
    onBaseUrlChange,
    onSave,
  } = props;

  const apiKeyId = `provider-${id}-api-key`;
  const baseUrlId = `provider-${id}-base-url`;

  return (
    <form
      className="space-y-4 border-t border-border pt-5 first:border-t-0 first:pt-0"
      onSubmit={event => {
        event.preventDefault();
        onSave();
      }}
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium text-foreground">{label}</p>
        <span
          className={cn(
            "text-label",
            hasKey ? "status-win" : "text-muted-foreground"
          )}
        >
          {hasKey ? "已配置" : "未配置"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
        <Label htmlFor={apiKeyId} className="text-label pt-2">
          api key
        </Label>
        <Input
          id={apiKeyId}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasKey ? "已配置（留空则保留现有 key）" : "sk-..."}
          value={apiKeyDraft}
          onChange={event => onApiKeyChange(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3 sm:gap-4 items-start">
        <Label htmlFor={baseUrlId} className="text-label pt-2">
          base url
        </Label>
        <div className="space-y-1">
          <Input
            id={baseUrlId}
            type="url"
            placeholder={defaultBaseUrl}
            value={baseUrlDraft}
            onChange={event => onBaseUrlChange(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            可选，留空走官方地址。default model: {defaultModel}
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isSaving}>
          {isSaving ? <Loader2 className="size-4 animate-spin" /> : "保存"}
        </Button>
      </div>
    </form>
  );
}

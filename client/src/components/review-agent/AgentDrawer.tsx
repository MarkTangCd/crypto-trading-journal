import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { AgentMessageList, type ReviewMessage } from "./AgentMessageList";
import { useReviewStream } from "./useReviewStream";

type ProviderId = "deepseek" | "kimi" | "glm" | "openai" | "gemini";

interface Props {
  transactionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ transactionId, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [lockedProviderId, setLockedProviderId] = useState<string | null>(null);
  const [pickedProviderId, setPickedProviderId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const providersQuery = trpc.settings.listProviders.useQuery(undefined, {
    enabled: open,
  });
  const defaultQuery = trpc.settings.getDefaultProvider.useQuery(undefined, {
    enabled: open,
  });
  const activeQuery = trpc.reviewAgent.getActive.useQuery(
    { transactionId },
    { enabled: open }
  );

  const providers = providersQuery.data ?? [];
  const configuredProviders = providers.filter(p => p.hasKey);
  const providerLabel = (id: string) =>
    providers.find(p => p.id === id)?.label ?? id;

  const openMutation = trpc.reviewAgent.open.useMutation({
    onSuccess: data => {
      setConversationId(data.conversationId);
      // open() returns conversationId + messages but no providerId — pull the
      // freshly-persisted row via getActive's cache so the lock label is
      // accurate even on first open.
      utils.reviewAgent.getActive.invalidate({ transactionId });
    },
    onError: error => toast.error(error.message || "无法打开复盘对话"),
  });

  const listQuery = trpc.reviewAgent.list.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null }
  );

  const invalidateThread = () => {
    if (conversationId !== null) {
      utils.reviewAgent.list.invalidate({ conversationId });
    }
  };

  const stream = useReviewStream({
    conversationId,
    onDone: () => {
      setDraft("");
      invalidateThread();
    },
    onError: message => {
      toast.error(message || "助手回复失败");
      invalidateThread();
    },
  });

  // Reset local state when the drawer closes — keeps subsequent opens clean.
  useEffect(() => {
    if (open) return;
    setConversationId(null);
    setLockedProviderId(null);
    setPickedProviderId(null);
    if (stream.isStreaming) stream.stop();
  }, [open, stream]);

  // Sync state from server: if a conversation already exists we lock to it,
  // otherwise pre-select the user's default provider in the picker.
  useEffect(() => {
    if (!open) return;
    if (activeQuery.data) {
      setConversationId(activeQuery.data.conversationId);
      setLockedProviderId(activeQuery.data.providerId);
      return;
    }
    if (activeQuery.data === null && pickedProviderId === null) {
      const fallback =
        defaultQuery.data?.defaultProvider ??
        configuredProviders[0]?.id ??
        null;
      if (fallback) setPickedProviderId(fallback);
    }
  }, [
    open,
    activeQuery.data,
    defaultQuery.data,
    configuredProviders,
    pickedProviderId,
  ]);

  const activeProviderId = lockedProviderId ?? pickedProviderId;
  const selectedHasKey = useMemo(() => {
    if (!activeProviderId) return false;
    return providers.some(p => p.id === activeProviderId && p.hasKey);
  }, [providers, activeProviderId]);

  const handleStartConversation = () => {
    if (!pickedProviderId) return;
    openMutation.mutate({
      transactionId,
      providerId: pickedProviderId as ProviderId,
    });
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || conversationId === null || stream.isStreaming) return;
    setDraft("");
    stream.start(text);
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleStop = () => {
    stream.stop();
    invalidateThread();
  };

  const canonical: ReviewMessage[] =
    listQuery.data ??
    (openMutation.data?.messages as ReviewMessage[] | undefined) ??
    activeQuery.data?.messages ??
    [];
  const isBootstrapping =
    providersQuery.isLoading || defaultQuery.isLoading || activeQuery.isLoading;
  const isLoadingMessages =
    openMutation.isPending || (listQuery.isLoading && conversationId !== null);
  // "thinking" stays on until the first delta — avoids an empty assistant bubble.
  const isWaiting =
    isLoadingMessages || (stream.isStreaming && !stream.pending?.assistantText);
  const titleProvider = activeProviderId ? providerLabel(activeProviderId) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border space-y-2">
          <SheetTitle className="text-sm font-medium tracking-wide lowercase">
            {titleProvider ? `复盘对话 · ${titleProvider}` : "复盘对话"}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            上下文包含当前 trade 的字段、账户状态与最近同向交易。对话仅与本笔
            trade 绑定。
          </SheetDescription>
          {!isBootstrapping && lockedProviderId && (
            <p className="text-xs text-muted-foreground lowercase">
              provider · {providerLabel(lockedProviderId)}（本笔会话已锁定）
            </p>
          )}
          {!isBootstrapping &&
            !lockedProviderId &&
            configuredProviders.length > 0 && (
              <ProviderPicker
                providers={configuredProviders}
                selected={pickedProviderId}
                onSelect={setPickedProviderId}
                disabled={openMutation.isPending}
              />
            )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isBootstrapping ? (
            <div className="flex justify-center pt-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : configuredProviders.length === 0 ? (
            <EmptyKeyState />
          ) : !lockedProviderId ? (
            <StartConversationState
              onStart={handleStartConversation}
              isStarting={openMutation.isPending}
              canStart={Boolean(pickedProviderId) && selectedHasKey}
            />
          ) : (
            <AgentMessageList
              messages={canonical}
              pending={stream.pending}
              isWaiting={isWaiting}
            />
          )}
        </div>

        {lockedProviderId && (
          <div className="border-t border-border px-6 py-4 space-y-2">
            <Textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleKey}
              placeholder="问 agent…（⌘+Enter 发送）"
              rows={3}
              disabled={conversationId === null || stream.isStreaming}
            />
            <div className="flex justify-end">
              {stream.isStreaming ? (
                <Button variant="outline" onClick={handleStop}>
                  停止
                </Button>
              ) : (
                <Button
                  onClick={handleSend}
                  disabled={!draft.trim() || conversationId === null}
                >
                  发送
                </Button>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

interface ProviderPickerProps {
  providers: { id: string; label: string }[];
  selected: string | null;
  onSelect: (id: string) => void;
  disabled: boolean;
}

function ProviderPicker(props: ProviderPickerProps) {
  return (
    <div
      role="radiogroup"
      aria-label="选择本笔对话的 provider"
      className="flex flex-wrap gap-1.5"
    >
      {props.providers.map(meta => {
        const isSelected = meta.id === props.selected;
        return (
          <button
            key={meta.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={props.disabled}
            onClick={() => props.onSelect(meta.id)}
            className={cn(
              "px-2.5 py-1 text-xs border transition-colors lowercase tabular-nums",
              isSelected
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:text-foreground hover:border-foreground"
            )}
          >
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

interface StartConversationStateProps {
  onStart: () => void;
  isStarting: boolean;
  canStart: boolean;
}

function StartConversationState(props: StartConversationStateProps) {
  return (
    <div className="space-y-4 pt-2">
      <p className="text-sm text-muted-foreground">
        选好上方的 provider 后开始本笔的复盘对话。一旦开始，本笔会话将锁定该
        provider，避免历史消息因模型切换出现漂移。
      </p>
      <Button
        onClick={props.onStart}
        disabled={!props.canStart || props.isStarting}
      >
        {props.isStarting ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          "开始对话"
        )}
      </Button>
    </div>
  );
}

function EmptyKeyState() {
  return (
    <div className="space-y-3">
      <p className="text-sm">还没有配置任何 provider 的 api key。</p>
      <p className="text-sm text-muted-foreground">
        请到{" "}
        <Link href="/settings" className="underline hover:text-foreground">
          Settings · AI 复盘助手
        </Link>{" "}
        填写后再回到这里。
      </p>
    </div>
  );
}

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Link } from "wouter";
import { AgentMessageList } from "./AgentMessageList";

interface Props {
  transactionId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ transactionId, open, onOpenChange }: Props) {
  const utils = trpc.useUtils();
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

  const providerConfigQuery = trpc.settings.getProviderConfig.useQuery(
    { providerId: "deepseek" },
    { enabled: open }
  );
  const hasKey = providerConfigQuery.data?.hasKey ?? false;

  const openMutation = trpc.reviewAgent.open.useMutation({
    onSuccess: data => setConversationId(data.conversationId),
    onError: error => toast.error(error.message || "无法打开复盘对话"),
  });

  const listQuery = trpc.reviewAgent.list.useQuery(
    { conversationId: conversationId ?? 0 },
    { enabled: conversationId !== null }
  );

  const sendMutation = trpc.reviewAgent.send.useMutation({
    onSuccess: () => {
      setDraft("");
      if (conversationId !== null) {
        utils.reviewAgent.list.invalidate({ conversationId });
      }
    },
    onError: error => toast.error(error.message || "发送失败"),
  });

  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (!hasKey || seededRef.current || openMutation.isPending) return;
    seededRef.current = true;
    openMutation.mutate({ transactionId });
  }, [open, hasKey, transactionId, openMutation]);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || conversationId === null) return;
    sendMutation.mutate({ conversationId, userText: text });
  };

  const handleKey = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      handleSend();
    }
  };

  const messages =
    listQuery.data ??
    (openMutation.data?.messages as typeof listQuery.data) ??
    [];
  const isLoadingMessages =
    openMutation.isPending || (listQuery.isLoading && conversationId !== null);
  const isWaiting = isLoadingMessages || sendMutation.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col"
      >
        <SheetHeader className="px-6 pt-6 pb-3 border-b border-border space-y-1">
          <SheetTitle className="text-sm font-medium tracking-wide lowercase">
            复盘对话 · deepseek
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            上下文包含当前 trade 的字段、账户状态与最近同向交易。对话仅与本笔
            trade 绑定。
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {providerConfigQuery.isLoading ? (
            <div className="flex justify-center pt-12">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !hasKey ? (
            <EmptyKeyState />
          ) : (
            <AgentMessageList messages={messages} isWaiting={isWaiting} />
          )}
        </div>

        {hasKey && (
          <div className="border-t border-border px-6 py-4 space-y-2">
            <Textarea
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleKey}
              placeholder="问 agent…（⌘+Enter 发送）"
              rows={3}
              disabled={conversationId === null || sendMutation.isPending}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSend}
                disabled={
                  !draft.trim() ||
                  conversationId === null ||
                  sendMutation.isPending
                }
              >
                {sendMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  "发送"
                )}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyKeyState() {
  return (
    <div className="space-y-3">
      <p className="text-sm">还没有配置 deepseek api key。</p>
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

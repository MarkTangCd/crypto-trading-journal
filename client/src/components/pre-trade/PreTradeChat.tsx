import {
  AgentMessageList,
  type ReviewMessage,
} from "@/components/review-agent/AgentMessageList";
import { useReviewStream } from "@/components/review-agent/useReviewStream";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const PRE_TRADE_STREAM_URL = "/api/pre-trade-agent/stream";

interface Props {
  preTradeId: number;
  conversationId: number;
}

export function PreTradeChat({
  preTradeId: _preTradeId,
  conversationId,
}: Props) {
  const utils = trpc.useUtils();
  const [draft, setDraft] = useState("");

  const listQuery = trpc.preTradeAgent.list.useQuery(
    { conversationId },
    { enabled: conversationId > 0 }
  );

  const invalidateThread = () => {
    utils.preTradeAgent.list.invalidate({ conversationId });
  };

  const stream = useReviewStream({
    conversationId,
    streamUrl: PRE_TRADE_STREAM_URL,
    onDone: () => {
      setDraft("");
      invalidateThread();
    },
    onError: message => {
      toast.error(message || "助手回复失败");
      invalidateThread();
    },
  });

  const handleSend = () => {
    const text = draft.trim();
    if (!text || stream.isStreaming) return;
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

  const messages: ReviewMessage[] = listQuery.data ?? [];
  const isLoadingMessages = listQuery.isLoading;
  const isWaiting =
    isLoadingMessages || (stream.isStreaming && !stream.pending?.assistantText);

  return (
    <div className="flex flex-col gap-6">
      <div className="min-h-[400px]">
        {isLoadingMessages && messages.length === 0 ? (
          <div className="flex justify-center pt-12">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <AgentMessageList
            messages={messages}
            pending={stream.pending}
            isWaiting={isWaiting}
          />
        )}
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <Textarea
          value={draft}
          onChange={event => setDraft(event.target.value)}
          onKeyDown={handleKey}
          placeholder="继续问 agent…（⌘+Enter 发送）"
          rows={3}
          disabled={stream.isStreaming}
        />
        <div className="flex justify-end">
          {stream.isStreaming ? (
            <Button variant="outline" onClick={handleStop}>
              停止
            </Button>
          ) : (
            <Button onClick={handleSend} disabled={!draft.trim()}>
              发送
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

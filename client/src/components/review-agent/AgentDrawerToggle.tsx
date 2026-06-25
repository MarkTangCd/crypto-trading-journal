import { Button } from "@/components/ui/button";
import { useState } from "react";
import { AgentDrawer } from "./AgentDrawer";

interface Props {
  transactionId: number;
}

/**
 * Floating control rendered inside TransactionDetail. Owns the open/closed
 * state of the AgentDrawer so the parent page doesn't need to thread it.
 */
export function AgentDrawerToggle({ transactionId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        打开 AI 复盘
      </Button>
      <AgentDrawer
        transactionId={transactionId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}

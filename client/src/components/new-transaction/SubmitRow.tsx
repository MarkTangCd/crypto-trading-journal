import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

type Props = {
  pending: boolean;
  disabled: boolean;
  onCancel: () => void;
};

export function SubmitRow(props: Props) {
  return (
    <div className="flex items-center gap-6 pt-6 border-t border-border">
      <Button type="submit" disabled={props.disabled || props.pending}>
        {props.pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          "record trade"
        )}
      </Button>
      <button
        type="button"
        onClick={props.onCancel}
        className="text-label hover:text-foreground transition-colors"
      >
        cancel
      </button>
    </div>
  );
}

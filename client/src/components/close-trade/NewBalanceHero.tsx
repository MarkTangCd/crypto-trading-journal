import type { ClosePreview } from "@/lib/closePreview";
import { fmtMoney, toneClass, type Tone } from "@/lib/ledger";
import { cn } from "@/lib/utils";

type Props = {
  preview: ClosePreview;
  currentBalance: number;
};

export function NewBalanceHero({ preview, currentBalance }: Props) {
  const hasOkPreview = preview.kind === "ok";
  const previewReturn = hasOkPreview ? preview.returnAmount : 0;
  const previewBalance = currentBalance + previewReturn;
  const previewTone: Tone =
    hasOkPreview && preview.outcome === "win"
      ? "win"
      : hasOkPreview && preview.outcome === "loss"
        ? "loss"
        : undefined;

  return (
    <section
      className="border-t border-border pt-5"
      aria-labelledby="preview-label"
    >
      <p id="preview-label" className="text-label">
        new balance
      </p>
      <p
        className={cn(
          "mt-2 text-4xl font-medium leading-none tabular-nums",
          hasOkPreview && toneClass(previewTone)
        )}
      >
        ${fmtMoney(previewBalance)}
      </p>
      <p className="text-label mt-3">
        from ${fmtMoney(currentBalance)}
        {hasOkPreview && (
          <>
            <span className="mx-2" aria-hidden="true">
              ·
            </span>
            <span className={toneClass(previewTone)}>
              {previewReturn >= 0 ? "+" : "-"}$
              {fmtMoney(Math.abs(previewReturn))}
            </span>
          </>
        )}
      </p>
    </section>
  );
}

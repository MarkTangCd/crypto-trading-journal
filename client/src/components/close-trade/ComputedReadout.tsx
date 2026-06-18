import type { ClosePreview } from "@/lib/closePreview";
import { Field, fmtMoney, fmtRatio, toneClass, type Tone } from "@/lib/ledger";

type Props = { preview: ClosePreview };

export function ComputedReadout({ preview }: Props) {
  const hasOkPreview = preview.kind === "ok";
  const previewReturn = hasOkPreview ? preview.returnAmount : 0;
  const previewTone: Tone =
    hasOkPreview && preview.outcome === "win"
      ? "win"
      : hasOkPreview && preview.outcome === "loss"
        ? "loss"
        : undefined;

  return (
    <section aria-labelledby="computed-readout" className="space-y-4">
      <p id="computed-readout" className="text-label">
        computed
      </p>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 tabular-nums">
        <Field label="actual r/r">
          <span className={hasOkPreview ? toneClass(previewTone) : ""}>
            {hasOkPreview ? fmtRatio(preview.actualRr) : "—"}
          </span>
        </Field>
        <Field label="outcome">
          <span className={hasOkPreview ? toneClass(previewTone) : ""}>
            {hasOkPreview
              ? preview.outcome === "breakeven"
                ? "breakeven"
                : preview.outcome
              : "—"}
          </span>
        </Field>
        <Field label="return">
          {hasOkPreview ? (
            <span className={toneClass(previewTone)}>
              {previewReturn >= 0 ? "+" : "-"}$
              {fmtMoney(Math.abs(previewReturn))}
            </span>
          ) : (
            "—"
          )}
        </Field>
      </div>
    </section>
  );
}

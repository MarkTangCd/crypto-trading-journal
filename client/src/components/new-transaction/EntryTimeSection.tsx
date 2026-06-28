import { Field, INPUT_CLASS, SectionHeader } from "@/lib/ledger";
import { cn } from "@/lib/utils";

type Props = {
  startTime: string;
  onChange: (v: string) => void;
};

export function EntryTimeSection(props: Props) {
  return (
    <section className="space-y-6">
      <SectionHeader>entry time</SectionHeader>
      <Field label="started" htmlFor="startTime">
        <input
          id="startTime"
          type="datetime-local"
          value={props.startTime}
          onChange={e => props.onChange(e.target.value)}
          className={cn(INPUT_CLASS)}
        />
      </Field>
    </section>
  );
}

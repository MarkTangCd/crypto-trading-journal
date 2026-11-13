// PROTOTYPE (TASK-88, branch prototype/journal-ui). Three variants of the
// Journal pages on the real /journal, /journal/setups and /journal/:id
// routes, switched by ?variant=A|B|C and the floating bar. In-memory data
// only; a reload reseeds.
import {
  EntryA,
  ListA,
  SetupsA,
} from "@/components/journal-prototype/VariantA";
import {
  EntryB,
  ListB,
  SetupsB,
} from "@/components/journal-prototype/VariantB";
import {
  EntryC,
  ListC,
  SetupsC,
} from "@/components/journal-prototype/VariantC";
import {
  PrototypeSwitcher,
  useVariant,
} from "@/components/journal-prototype/shared";
import { useRoute } from "wouter";

export default function JournalPrototype() {
  const variant = useVariant();
  const [isSetups] = useRoute("/journal/setups");
  const [isEntry, params] = useRoute<{ id: string }>("/journal/:id");
  const entryId = !isSetups && isEntry ? Number(params.id) : null;

  const page = isSetups ? "setups" : entryId !== null ? "entry" : "list";

  return (
    <>
      {variant === "A" && page === "list" && <ListA />}
      {variant === "A" && page === "entry" && (
        <EntryA key={entryId} entryId={entryId ?? 0} />
      )}
      {variant === "A" && page === "setups" && <SetupsA />}
      {variant === "B" && page === "list" && <ListB />}
      {variant === "B" && page === "entry" && (
        <EntryB key={entryId} entryId={entryId ?? 0} />
      )}
      {variant === "B" && page === "setups" && <SetupsB />}
      {variant === "C" && page === "list" && <ListC />}
      {variant === "C" && page === "entry" && (
        <EntryC key={entryId} entryId={entryId ?? 0} />
      )}
      {variant === "C" && page === "setups" && <SetupsC />}
      <PrototypeSwitcher />
    </>
  );
}

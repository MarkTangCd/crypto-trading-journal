// PROTOTYPE (TASK-72, branch prototype/plans-ui). Three variants of the Plans
// pages on the real /plans and /plans/:id routes, switched by ?variant=A|B|C
// and the floating bar. In-memory data only; a reload reseeds.
import { DetailA, ListA } from "@/components/plans-prototype/VariantA";
import { PageB } from "@/components/plans-prototype/VariantB";
import { DetailC, ListC } from "@/components/plans-prototype/VariantC";
import {
  PrototypeSwitcher,
  useVariant,
} from "@/components/plans-prototype/shared";
import { useParams } from "wouter";

export default function PlansPrototype() {
  const variant = useVariant();
  const params = useParams<{ id?: string }>();
  const planId = params.id ? Number(params.id) : null;

  return (
    <>
      {variant === "A" &&
        (planId === null ? (
          <ListA />
        ) : (
          <DetailA key={planId} planId={planId} />
        ))}
      {variant === "B" && <PageB key={planId ?? "list"} planId={planId} />}
      {variant === "C" &&
        (planId === null ? (
          <ListC />
        ) : (
          <DetailC key={planId} planId={planId} />
        ))}
      <PrototypeSwitcher />
    </>
  );
}

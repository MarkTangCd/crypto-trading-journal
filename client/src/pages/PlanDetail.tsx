import { Link, useParams } from "wouter";

// Placeholder until the plan detail page lands (TASK-81).
export default function PlanDetail() {
  const params = useParams<{ id: string }>();

  return (
    <div className="space-y-4 max-w-3xl">
      <Link href="/plans" className="text-label hover:text-foreground">
        ← plans
      </Link>
      <p className="text-title">plan {params.id}</p>
    </div>
  );
}

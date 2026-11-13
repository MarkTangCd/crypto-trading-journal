import { Link } from "wouter";

// Placeholder until the setups page lands (task-98).
export default function JournalSetups() {
  return (
    <div className="space-y-12 max-w-5xl">
      <Link href="/journal" className="text-label hover:text-foreground">
        ← journal
      </Link>
      <h1 className="text-title">setups</h1>
    </div>
  );
}

import { Link } from "wouter";

// Placeholder until the entry page lands (task-99).
export default function JournalEntry() {
  return (
    <div className="space-y-12 max-w-5xl">
      <Link href="/journal" className="text-label hover:text-foreground">
        ← journal
      </Link>
      <h1 className="text-title">journal entry</h1>
    </div>
  );
}

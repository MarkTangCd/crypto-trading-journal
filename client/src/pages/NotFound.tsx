import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="space-y-12 max-w-2xl">
      <h1 className="sr-only">page not found</h1>

      <section aria-labelledby="hero-label">
        <p id="hero-label" className="text-label">
          status
        </p>
        <p className="text-display mt-2 tabular-nums">404</p>
        <p className="text-label mt-4">page not found</p>
      </section>

      <section className="border-t border-border pt-10">
        <p>this route doesn't exist.</p>
        <Button variant="outline" className="mt-6" asChild>
          <Link href="/">← back home</Link>
        </Button>
      </section>
    </div>
  );
}

import { AgentProviderSection } from "@/components/settings/AgentProviderSection";
import { SkillsSection } from "@/components/settings/SkillsSection";
import { ToolKeysSection } from "@/components/settings/ToolKeysSection";
import { Link } from "wouter";

export default function Settings() {
  return (
    <div className="space-y-10 max-w-2xl">
      <h1 className="sr-only">Settings</h1>

      <header className="space-y-2">
        <p className="text-title">settings</p>
        <p className="text-label">journal preferences</p>
      </header>

      <section className="border-y border-border py-5">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="font-medium text-foreground">accounts</p>
            <p className="text-sm text-muted-foreground mt-1">
              create, switch, and edit the ledgers behind your trades.
            </p>
          </div>
          <Link
            href="/accounts"
            className="text-label hover:text-foreground transition-colors whitespace-nowrap"
          >
            manage →
          </Link>
        </div>
      </section>

      <AgentProviderSection />

      <ToolKeysSection />

      <SkillsSection />

      <section>
        <p className="text-label">about</p>
        <p className="mt-3 text-sm text-muted-foreground max-w-prose">
          a minimalist trading journal for tracking, reviewing, and analyzing
          crypto trades.
        </p>
      </section>
    </div>
  );
}

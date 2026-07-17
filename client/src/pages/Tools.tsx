import { Link } from "wouter";

// Bench Notebook index: a lowercase table-of-contents, not a card grid.
// New tools append a row here and mount at /tools/:tool.
const TOOLS = [
  {
    path: "/tools/position-size",
    name: "position size calculator",
    note: "fixed-risk sizing from stop distance",
  },
];

export default function Tools() {
  return (
    <div className="space-y-12 max-w-3xl">
      <header className="space-y-2">
        <p className="text-title">tools</p>
        <p className="text-label">trading utilities</p>
      </header>

      <ul className="border-t border-border">
        {TOOLS.map(tool => (
          <li key={tool.path} className="border-b border-border">
            <Link
              href={tool.path}
              className="flex items-baseline justify-between gap-4 py-4 group"
            >
              <span className="text-base group-hover:text-foreground transition-colors">
                {tool.name}
              </span>
              <span className="text-label">{tool.note}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

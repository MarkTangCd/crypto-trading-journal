import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  text: string;
}

const components: Components = {
  p: ({ children }) => <p className="my-2 whitespace-pre-wrap">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  h1: ({ children }) => (
    <h1 className="my-3 text-base font-semibold">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="my-3 text-base font-semibold">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="my-3 text-base font-semibold">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="my-3 text-base font-semibold">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="my-3 text-base font-semibold">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="my-3 text-base font-semibold">{children}</h6>
  ),
  code: ({ className, children, ...rest }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code className="border-0 p-0" {...rest}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="border border-border px-1 py-0.5 text-[0.85em]"
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto border border-border p-3 text-xs">
      {children}
    </pre>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline hover:text-foreground"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  hr: () => <hr className="my-3 border-border" />,
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l border-border pl-3">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <table className="my-2 border-collapse border border-border text-xs">
      {children}
    </table>
  ),
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 text-left">{children}</td>
  ),
};

/**
 * Renders markdown-formatted agent text with styles pinned to the Bench
 * Notebook design tokens. Tolerates incomplete syntax so it can render
 * streaming SSE deltas mid-token without throwing.
 */
export function AgentMarkdown({ text }: Props) {
  return (
    <div className="text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

import { z } from "zod";

/**
 * Rich text as stored: ProseMirror JSON written by the Plans editor. Kept free
 * of Tiptap imports so the schema and server never load editor packages.
 */
export type RichTextNode = {
  type: string;
  attrs?: Record<string, unknown>;
  text?: string;
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  content?: RichTextNode[];
};

export type RichTextDoc = { type: "doc"; content?: RichTextNode[] };

// Only the root is validated; the editor is the only writer of nested nodes.
export const richTextDocSchema: z.ZodType<RichTextDoc> = z.object({
  type: z.literal("doc"),
  content: z
    .array(
      z.custom<RichTextNode>(
        v => typeof v === "object" && v !== null && !Array.isArray(v)
      )
    )
    .optional(),
});

function hasContent(node: RichTextNode): boolean {
  if (node.type === "image") return true;
  if (node.text !== undefined && node.text.trim() !== "") return true;
  return node.content?.some(hasContent) ?? false;
}

/** True unless the doc holds non-whitespace text or an image. */
export function isEmptyDoc(doc: RichTextDoc): boolean {
  return !(doc.content?.some(hasContent) ?? false);
}

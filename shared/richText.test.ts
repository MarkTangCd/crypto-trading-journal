import { describe, expect, it } from "vitest";
import { isEmptyDoc, richTextDocSchema, type RichTextDoc } from "./richText";

const paragraph = (text?: string) => ({
  type: "paragraph",
  ...(text === undefined ? {} : { content: [{ type: "text", text }] }),
});

describe("isEmptyDoc", () => {
  it("is empty without content", () => {
    expect(isEmptyDoc({ type: "doc" })).toBe(true);
    expect(isEmptyDoc({ type: "doc", content: [] })).toBe(true);
  });

  it("is empty with only an empty paragraph", () => {
    expect(isEmptyDoc({ type: "doc", content: [paragraph()] })).toBe(true);
  });

  it("is empty with whitespace-only text", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [paragraph("  \n\t "), paragraph(" ")],
    };
    expect(isEmptyDoc(doc)).toBe(true);
  });

  it("is not empty with only an image", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { src: "/api/images/1" } }],
    };
    expect(isEmptyDoc(doc)).toBe(false);
  });

  it("is not empty with text nested in a list", () => {
    const doc: RichTextDoc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("break above")] }],
        },
      ],
    };
    expect(isEmptyDoc(doc)).toBe(false);
  });

  it("is not empty with plain text", () => {
    expect(isEmptyDoc({ type: "doc", content: [paragraph("x")] })).toBe(false);
  });
});

describe("richTextDocSchema", () => {
  it("accepts a doc with nested nodes", () => {
    const doc = { type: "doc", content: [paragraph("hello")] };
    expect(richTextDocSchema.parse(doc)).toEqual(doc);
  });

  it("accepts a doc without content", () => {
    expect(richTextDocSchema.safeParse({ type: "doc" }).success).toBe(true);
  });

  it("rejects a non-doc root", () => {
    expect(richTextDocSchema.safeParse(paragraph("x")).success).toBe(false);
    expect(richTextDocSchema.safeParse(null).success).toBe(false);
    expect(
      richTextDocSchema.safeParse({ type: "doc", content: "text" }).success
    ).toBe(false);
  });

  it("rejects non-object top-level nodes", () => {
    expect(
      richTextDocSchema.safeParse({ type: "doc", content: ["text"] }).success
    ).toBe(false);
  });
});

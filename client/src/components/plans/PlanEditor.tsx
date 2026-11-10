import { cn } from "@/lib/utils";
import { IMAGE_MIME_TYPES, MAX_IMAGE_BYTES } from "@shared/const";
import type { RichTextDoc } from "@shared/richText";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const AUTOSAVE_MS = 1000;

// Position and node of the image whose src is `src`, if it is still there.
function findImage(editor: Editor, src: string) {
  let found: { pos: number; attrs: Record<string, unknown> } | undefined;
  editor.state.doc.descendants((node, pos) => {
    if (found) return false;
    if (node.type.name === "image" && node.attrs.src === src) {
      found = { pos, attrs: node.attrs };
    }
  });
  return found;
}

async function uploadImage(planId: number, file: File): Promise<number> {
  const response = await fetch(`/api/images?planId=${planId}`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
  const body: { id?: number; error?: string } = await response
    .json()
    .catch(() => ({}));
  if (!response.ok || typeof body.id !== "number") {
    throw new Error(body.error ?? `upload failed (${response.status})`);
  }
  return body.id;
}

/**
 * Rich text for plans: market context, scenario content and observations.
 * Autosaves through `onSave` ~1 s after the last change; images are uploaded
 * to /api/images and stored in the document by URL, never as base64.
 */
export function PlanEditor({
  planId,
  content,
  editable,
  onSave,
  placeholder,
  className,
}: {
  planId: number;
  content: RichTextDoc | null;
  editable: boolean;
  onSave: (doc: RichTextDoc) => void;
  placeholder?: string;
  className?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingDoc = useRef<RichTextDoc | null>(null);
  const pendingUploads = useRef(0);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pendingDoc.current) onSaveRef.current(pendingDoc.current);
    pendingDoc.current = null;
  };

  // A blob: placeholder must never be saved, so wait for uploads to settle.
  const scheduleSave = (editor: Editor) => {
    if (pendingUploads.current > 0) return;
    pendingDoc.current = editor.getJSON() as RichTextDoc;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, AUTOSAVE_MS);
  };

  const insertImages = (editor: Editor, files: File[], pos: number) => {
    for (const file of files) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 10 mb`);
        continue;
      }
      const url = URL.createObjectURL(file);
      pendingUploads.current += 1;
      editor
        .chain()
        .insertContentAt(pos, {
          type: "image",
          attrs: { src: url, alt: file.name, title: "uploading" },
        })
        .run();

      uploadImage(planId, file)
        .then(id => {
          if (editor.isDestroyed) return;
          const image = findImage(editor, url);
          if (!image) return;
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(image.pos, undefined, {
                ...image.attrs,
                src: `/api/images/${id}`,
                title: null,
              });
              return true;
            })
            .run();
        })
        .catch((error: Error) => {
          toast.error(`image upload failed: ${error.message}`);
          if (editor.isDestroyed) return;
          const image = findImage(editor, url);
          if (!image) return;
          editor
            .chain()
            .command(({ tr }) => {
              const node = tr.doc.nodeAt(image.pos);
              if (node) tr.delete(image.pos, image.pos + node.nodeSize);
              return true;
            })
            .run();
        })
        .finally(() => {
          URL.revokeObjectURL(url);
          pendingUploads.current -= 1;
          if (!editor.isDestroyed) scheduleSave(editor);
        });
    }
  };

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        italic: false,
        strike: false,
        underline: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, linkOnPaste: true },
      }),
      Image.configure({ allowBase64: false }),
      FileHandler.configure({
        allowedMimeTypes: [...IMAGE_MIME_TYPES],
        consumePasteEvent: true,
        onPaste: (ed, files) =>
          insertImages(ed, files, ed.state.selection.anchor),
        onDrop: (ed, files, pos) => insertImages(ed, files, pos),
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: content ?? undefined,
    editable,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: cn("plan-editor", className) },
    },
    onUpdate: ({ editor: ed }) => scheduleSave(ed),
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  // Flush a pending autosave on unmount so navigating away loses nothing.
  useEffect(() => flush, []);

  return <EditorContent editor={editor} />;
}

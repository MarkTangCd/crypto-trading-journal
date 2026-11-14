import { imageUploadError, uploadImage, type ImageOwner } from "@/lib/images";
import { cn } from "@/lib/utils";
import { IMAGE_MIME_TYPES } from "@shared/const";
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

/**
 * Rich text for plans, journal entries and setups. Autosaves through `onSave`
 * ~1 s after the last change; images are uploaded to /api/images under
 * `owner` and stored in the document by URL, never as base64.
 */
export function RichTextEditor({
  owner,
  content,
  editable,
  onSave,
  placeholder,
  className,
  debounceMs = AUTOSAVE_MS,
}: {
  owner: ImageOwner;
  content: RichTextDoc | null;
  editable: boolean;
  onSave: (doc: RichTextDoc) => void;
  placeholder?: string;
  className?: string;
  /** Delay before `onSave`; 0 hands every change over synchronously */
  debounceMs?: number;
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
    // Synchronous, so a keystroke right after a change sees the latest doc.
    if (debounceMs === 0) return flush();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, debounceMs);
  };

  const insertImages = (editor: Editor, files: File[], pos: number) => {
    for (const file of files) {
      const error = imageUploadError(file);
      if (error) {
        toast.error(error);
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

      uploadImage(file, owner)
        .then(({ url: src }) => {
          if (editor.isDestroyed) return;
          const image = findImage(editor, url);
          if (!image) return;
          editor
            .chain()
            .command(({ tr }) => {
              tr.setNodeMarkup(image.pos, undefined, {
                ...image.attrs,
                src,
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
    // Save before a click elsewhere (mark reviewed, delete) changes state.
    onBlur: () => flush(),
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

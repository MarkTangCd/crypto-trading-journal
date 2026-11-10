// PROTOTYPE (TASK-72). Tiptap editor per the rich-text research ticket
// (TASK-70). Images stay base64 here; the real build uploads to /api/images.
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import {
  EditorContent,
  useEditor,
  type Editor,
  type JSONContent,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";
import { toast } from "sonner";

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const AUTOSAVE_MS = 1000;

function insertImages(editor: Editor, files: File[], pos: number) {
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`${file.name} is over 10 mb`);
      continue;
    }
    const reader = new FileReader();
    reader.onload = () => {
      editor
        .chain()
        .insertContentAt(pos, {
          type: "image",
          attrs: { src: reader.result, alt: file.name },
        })
        .focus()
        .run();
    };
    reader.readAsDataURL(file);
  }
}

export function PlanEditor({
  content,
  editable,
  onSave,
  placeholder,
  className,
  autoFocus,
  saveOnChange = true,
  editorRef,
}: {
  content: JSONContent | null;
  editable: boolean;
  onSave?: (json: JSONContent) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  // false: the parent reads the document through editorRef (composer use).
  saveOnChange?: boolean;
  editorRef?: React.RefObject<Editor | null>;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<JSONContent | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current) onSaveRef.current?.(pending.current);
    pending.current = null;
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
      Image.configure({ allowBase64: true }),
      FileHandler.configure({
        allowedMimeTypes: IMAGE_TYPES,
        consumePasteEvent: true,
        onPaste: (ed, files) =>
          insertImages(ed, files, ed.state.selection.anchor),
        onDrop: (ed, files, pos) => insertImages(ed, files, pos),
      }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: content ?? undefined,
    editable,
    autofocus: autoFocus ? "end" : false,
    shouldRerenderOnTransaction: false,
    editorProps: {
      attributes: { class: cn("plan-editor", className) },
    },
    onUpdate: ({ editor: ed }) => {
      if (!saveOnChange) return;
      pending.current = ed.getJSON();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, AUTOSAVE_MS);
    },
  });

  useEffect(() => {
    if (editorRef) editorRef.current = editor;
  }, [editor, editorRef]);

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  // Flush a pending autosave on unmount so navigating away loses nothing.
  useEffect(() => flush, []);

  return <EditorContent editor={editor} />;
}

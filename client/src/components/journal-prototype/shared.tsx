// PROTOTYPE (TASK-88). Pieces every Journal variant uses: the variant
// switcher, variant-preserving links, the rich text editor, the screenshot
// slot, the review prompt block, picker state and formatting helpers.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { fmtDecimal, fmtMoney, toneClass } from "@/lib/ledger";
import { cn } from "@/lib/utils";
import { utc8Parts } from "@shared/time";
import type { RichTextDoc } from "@shared/richText";
import { isEmptyDoc } from "@shared/richText";
import FileHandler from "@tiptap/extension-file-handler";
import Image from "@tiptap/extension-image";
import { Placeholder } from "@tiptap/extensions";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation, useSearch } from "wouter";
import {
  actions,
  pickableTrades,
  useJournal,
  type Ratio,
  type Shot,
  type Trade,
} from "./store";

export const VARIANTS = [
  { key: "A", name: "ledger" },
  { key: "B", name: "facing pages" },
  { key: "C", name: "review queue" },
] as const;
export type VariantKey = (typeof VARIANTS)[number]["key"];

export function useVariant(): VariantKey {
  const params = new URLSearchParams(useSearch());
  const raw = params.get("variant");
  return VARIANTS.find(v => v.key === raw)?.key ?? "A";
}

// Navigate inside the prototype without losing ?variant=.
export function useJournalNav() {
  const variant = useVariant();
  const [, setLocation] = useLocation();
  const href = useCallback(
    (path: string) =>
      `${path}${path.includes("?") ? "&" : "?"}variant=${variant}`,
    [variant]
  );
  const go = useCallback(
    (path: string) => setLocation(href(path)),
    [href, setLocation]
  );
  return { href, go };
}

// ?pick=<tradeId>: the trade detail shortcut preselects that trade.
export function usePreselectedTrade(): number | null {
  const raw = new URLSearchParams(useSearch()).get("pick");
  return raw ? Number(raw) : null;
}

export function PrototypeSwitcher() {
  const current = useVariant();
  const [location, setLocation] = useLocation();
  const index = VARIANTS.findIndex(v => v.key === current);

  const step = useCallback(
    (delta: number) => {
      const next =
        VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length];
      setLocation(`${location}?variant=${next.key}`, { replace: true });
    },
    [index, location, setLocation]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable='true']")
      ) {
        return;
      }
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (!import.meta.env.DEV) return null;

  return (
    <div
      role="toolbar"
      aria-label="prototype variant"
      className="fixed bottom-4 right-4 z-[60] flex items-center gap-1 rounded-full bg-[oklch(0.45_0.2_290)] text-white px-2 py-1 text-xs shadow-lg"
    >
      <button
        type="button"
        onClick={() => step(-1)}
        className="p-1 hover:opacity-70"
        aria-label="previous variant"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="px-2 whitespace-nowrap">
        prototype · {current} ({VARIANTS[index].name})
      </span>
      <button
        type="button"
        onClick={() => step(1)}
        className="p-1 hover:opacity-70"
        aria-label="next variant"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      <span className="mx-1 h-4 w-px bg-white/40" aria-hidden />
      <button
        type="button"
        onClick={() => {
          const closed = actions.closeOldestOpenTrade();
          toast(
            closed
              ? `sim sync: closed ${closed.symbol.toLowerCase()} ${closed.side} #${closed.id}`
              : "sim sync: no open trades left"
          );
        }}
        className="px-2 py-1 hover:opacity-70 whitespace-nowrap"
        title="prototype only: close the oldest open trade as if a sync saw it"
      >
        sim: close a trade
      </button>
    </div>
  );
}

// ---------- formatting ----------

// "nov 10 05:12"
export function dayTime(ts: number): string {
  const p = utc8Parts(ts);
  return `${p.monthName.toLowerCase()} ${p.day} ${p.hhmm}`;
}

// "nov 10"
export function day(ts: number): string {
  const p = utc8Parts(ts);
  return `${p.monthName.toLowerCase()} ${p.day}`;
}

export function hhmm(ts: number): string {
  return utc8Parts(ts).hhmm;
}

export const px = (v: number | null) => fmtDecimal(v, 4);

export function signedUsd(v: number): string {
  return `${v >= 0 ? "+" : "-"}$${fmtMoney(Math.abs(v))}`;
}

export function pnlToneClass(v: number): string {
  return toneClass(v > 0 ? "win" : v < 0 ? "loss" : undefined);
}

export function Pnl({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", pnlToneClass(value), className)}>
      {signedUsd(value)}
    </span>
  );
}

export function fmtRatioValue(r: Ratio, suffix = ""): string {
  return r.kind === "ok" ? `${r.value.toFixed(2)}${suffix}` : "—";
}

export function fmtR(r: Ratio): string {
  if (r.kind !== "ok") return "—";
  return `${r.value >= 0 ? "+" : ""}${r.value.toFixed(2)}r`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

export function tradeLine(t: Trade): string {
  return `${t.side} ${fmtDecimal(t.quantity)} @ ${px(t.entryPrice)}${
    t.exitPrice !== null ? ` → ${px(t.exitPrice)}` : ""
  }`;
}

// ---------- rich text ----------

const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const AUTOSAVE_MS = 1000;

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function insertImages(editor: Editor, files: File[], pos: number) {
  for (const file of files) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error(`${file.name} is over 10 mb`);
      continue;
    }
    readAsDataUrl(file).then(src =>
      editor
        .chain()
        .insertContentAt(pos, { type: "image", attrs: { src, alt: file.name } })
        .focus()
        .run()
    );
  }
}

/**
 * Prototype rich text: same extensions as PlanEditor, images as base64,
 * autosave ~1 s after the last change.
 */
export function ProtoEditor({
  content,
  editable,
  onSave,
  placeholder,
  className,
}: {
  content: RichTextDoc | null;
  editable: boolean;
  onSave: (doc: RichTextDoc | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

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
    shouldRerenderOnTransaction: false,
    editorProps: { attributes: { class: cn("plan-editor", className) } },
    onUpdate: ({ editor: ed }) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const json = ed.getJSON() as RichTextDoc;
        onSaveRef.current(isEmptyDoc(json) ? null : json);
      }, AUTOSAVE_MS);
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable, false);
    }
  }, [editor, editable]);

  return <EditorContent editor={editor} />;
}

/** Read-only or editable rich text; read-only and empty renders `emptyText`. */
export function RichField({
  value,
  editable,
  onSave,
  placeholder,
  emptyText = "—",
  className,
}: {
  value: RichTextDoc | null;
  editable: boolean;
  onSave: (doc: RichTextDoc | null) => void;
  placeholder?: string;
  emptyText?: string;
  className?: string;
}) {
  if (!editable && value === null) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ProtoEditor
      content={value}
      editable={editable}
      onSave={onSave}
      placeholder={placeholder}
      className={className}
    />
  );
}

// ---------- screenshot slot ----------

/**
 * Before / after screenshots: paste or drop several images, remove each.
 * Native button takes focus so Cmd+V lands here; the hidden input covers
 * clicking to choose files.
 */
export function ShotSlot({
  shots,
  editable,
  onAdd,
  onRemove,
  label,
  emptyText = "no screenshots.",
  className,
  thumbClassName,
}: {
  shots: Shot[];
  editable: boolean;
  onAdd: (src: string) => void;
  onRemove: (id: number) => void;
  label: string;
  emptyText?: string;
  className?: string;
  thumbClassName?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);

  const addFiles = (files: File[]) => {
    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) {
        toast.error(`${file.name} is not an image`);
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        toast.error(`${file.name} is over 10 mb`);
        continue;
      }
      readAsDataUrl(file).then(onAdd);
    }
  };

  if (!editable && shots.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div
      className={cn("space-y-3", className)}
      onDragOver={event => {
        if (!editable) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={event => {
        if (!editable) return;
        event.preventDefault();
        setOver(false);
        addFiles([...event.dataTransfer.files]);
      }}
    >
      {shots.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {shots.map(shot => (
            <li key={shot.id} className="relative group">
              <button
                type="button"
                onClick={() => setZoom(shot.src)}
                className="block"
                aria-label="view screenshot"
              >
                <img
                  src={shot.src}
                  alt=""
                  className={cn(
                    "h-28 w-auto border border-border object-cover",
                    thumbClassName
                  )}
                />
              </button>
              {editable && (
                <button
                  type="button"
                  onClick={() => onRemove(shot.id)}
                  aria-label="remove screenshot"
                  className="absolute top-1 right-1 bg-background border border-border p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <button
            type="button"
            onPaste={event => {
              const files = [...event.clipboardData.files];
              if (files.length > 0) {
                event.preventDefault();
                addFiles(files);
              }
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "w-full border border-dashed border-border px-4 py-3 text-left text-label hover:text-foreground focus:outline-none focus-visible:border-foreground focus-visible:text-foreground transition-colors",
              over && "border-foreground text-foreground"
            )}
          >
            {label} · paste, drop or click to choose
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_TYPES.join(",")}
            multiple
            hidden
            onChange={event => {
              addFiles([...(event.target.files ?? [])]);
              event.target.value = "";
            }}
          />
        </>
      )}
      {zoom && (
        <button
          type="button"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-8"
          aria-label="close screenshot"
        >
          <img
            src={zoom}
            alt=""
            className="max-h-full max-w-full border border-border"
          />
        </button>
      )}
    </div>
  );
}

// ---------- review prompts ----------

const PROMPTS = [
  "哪些方面做得好?",
  "哪些方面出了问题?",
  "我是否遵循了计划?",
  "我应该重复什么?",
  "我应该避免什么?",
  "主要教训是什么?",
  "下次我会做出哪些不同的做法?",
];

/** Static review prompt block, kept verbatim in Chinese; never stored. */
export function ReviewPrompts({ className }: { className?: string }) {
  return (
    <div
      lang="zh"
      className={cn("space-y-3 text-sm leading-relaxed", className)}
    >
      <p>交易结束后，问:</p>
      <ul className="space-y-1 pl-4">
        {PROMPTS.map(prompt => (
          <li key={prompt} className="list-['-_']">
            {prompt}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">
        目标不是为每一笔交易写长篇笔记。目标是养成持续反思的习惯。
      </p>
    </div>
  );
}

// ---------- trade picker state ----------

/**
 * Picker rules: current account's unlinked trades, newest first, symbol
 * search, same-symbol lock after the first tick, create on >= 1 tick.
 */
export function usePicker(preselect: number[] = []) {
  const s = useJournal();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number[]>(preselect);

  const all = useMemo(() => pickableTrades(s), [s]);
  const lockedSymbol =
    selected.length > 0
      ? (all.find(t => t.id === selected[0])?.symbol ?? null)
      : null;
  const q = query.trim().toUpperCase();
  const visible = all.filter(t => !q || t.symbol.includes(q));

  const toggle = (id: number) =>
    setSelected(current =>
      current.includes(id) ? current.filter(x => x !== id) : [...current, id]
    );
  const isDisabled = (t: Trade) =>
    lockedSymbol !== null && t.symbol !== lockedSymbol;

  return {
    query,
    setQuery,
    selected,
    setSelected,
    toggle,
    visible,
    lockedSymbol,
    isDisabled,
    canCreate: selected.length > 0,
    create: () => actions.createEntry(selected),
  };
}

// ---------- delete confirmation ----------

export function DeleteEntryDialog({
  open,
  onOpenChange,
  onConfirm,
  tradeCount,
  shotCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  tradeCount: number;
  shotCount: number;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>delete this journal entry?</AlertDialogTitle>
          <AlertDialogDescription>
            {plural(shotCount, "screenshot")} and every written field go with
            it. the {plural(tradeCount, "trade")} stay and can be picked again.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>
            delete entry
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

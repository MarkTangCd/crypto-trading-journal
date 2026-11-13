import { RichTextEditor } from "@/components/RichTextEditor";
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
import { INPUT_CLASS } from "@/lib/ledger";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ENTRY_TRIGGER_MAX, SETUP_NAME_MAX } from "@shared/const";
import { isEmptyDoc, type RichTextDoc } from "@shared/richText";
import { Loader2, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import { toast } from "sonner";

const LINK = "text-label hover:text-foreground transition-colors";
const NAME_LENGTH = `a name is 1 to ${SETUP_NAME_MAX} characters`;

const entriesWord = (n: number) => `${n} ${n === 1 ? "entry" : "entries"}`;

// Inline text for name errors the trader can fix; null means toast it.
function nameErrorText(code: string | undefined): string | null {
  if (code === "CONFLICT") return "name taken";
  if (code === "BAD_REQUEST") return NAME_LENGTH;
  return null;
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-label border-b border-border pb-2">{label}</h3>
      {children}
    </section>
  );
}

type Setup = {
  id: number;
  name: string;
  description: RichTextDoc | null;
  triggers: string[];
  usageCount: number;
};

export default function JournalSetups() {
  const utils = trpc.useUtils();
  const { data: setups, isLoading } = trpc.setup.list.useQuery();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = trpc.setup.create.useMutation({
    onSuccess: ({ id }) => {
      utils.setup.list.invalidate();
      setSelectedId(id);
      setDraft("");
      setError(null);
    },
    onError: error => {
      const text = nameErrorText(error.data?.code);
      if (text) setError(text);
      else toast.error(error.message || "failed to create setup");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2
          className="h-6 w-6 animate-spin text-foreground"
          aria-label="loading"
        />
      </div>
    );
  }

  const all = setups ?? [];
  const selected = all.find(setup => setup.id === selectedId) ?? all[0] ?? null;

  return (
    <div className="space-y-10 max-w-5xl pb-24">
      <div className="space-y-2">
        <Link href="/journal" className={LINK}>
          ← journal
        </Link>
        <h1 className="text-title">setups</h1>
        <p className="text-label">reusable patterns an entry is tagged with</p>
      </div>

      <div className="grid md:grid-cols-[16rem_1fr] gap-y-10">
        <div className="space-y-4 md:pr-8 md:border-r md:border-border">
          <form
            onSubmit={event => {
              event.preventDefault();
              const name = draft.trim();
              if (name.length < 1 || name.length > SETUP_NAME_MAX) {
                setError(NAME_LENGTH);
                return;
              }
              create.mutate({ name });
            }}
          >
            <input
              type="text"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="new setup name ⏎"
              aria-label="new setup name"
              maxLength={SETUP_NAME_MAX}
              disabled={create.isPending}
              className={cn(INPUT_CLASS, "placeholder:normal-case")}
            />
            {error && <p className="text-label pt-1">{error}</p>}
          </form>
          {all.length === 0 ? (
            <p className="text-sm">no setups yet. name one above.</p>
          ) : (
            <ul className="text-sm">
              {all.map(setup => {
                const current = setup.id === selected?.id;
                return (
                  <li key={setup.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(setup.id)}
                      aria-current={current}
                      className={cn(
                        "w-full flex items-baseline justify-between gap-3 py-2 border-b border-border text-left hover:underline underline-offset-4",
                        current && "font-medium"
                      )}
                    >
                      <span>
                        {current ? "▸ " : ""}
                        {setup.name}
                      </span>
                      <span className="text-label tabular-nums">
                        {setup.usageCount}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="md:pl-10">
          {selected ? (
            <SetupEditor key={selected.id} setup={selected} />
          ) : (
            <p className="text-sm text-muted-foreground">
              pick a setup on the left, or name a new one.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SetupEditor({ setup }: { setup: Setup }) {
  const utils = trpc.useUtils();
  const [name, setName] = useState(setup.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [trigger, setTrigger] = useState("");
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const rename = trpc.setup.update.useMutation({
    onSuccess: () => {
      setNameError(null);
      utils.setup.list.invalidate();
      utils.journal.list.invalidate();
    },
    onError: error => {
      const text = nameErrorText(error.data?.code);
      if (text) setNameError(text);
      else toast.error(error.message || "failed to rename setup");
    },
  });

  // Triggers and description: refresh the list so reselecting shows them.
  const update = trpc.setup.update.useMutation({
    onSuccess: () => utils.setup.list.invalidate(),
    onError: error => {
      toast.error(error.message || "failed to save setup");
    },
  });

  const remove = trpc.setup.delete.useMutation({
    onSuccess: () => utils.setup.list.invalidate(),
    onError: error => {
      toast.error(error.message || "failed to delete setup");
    },
  });

  const saveName = () => {
    const clean = name.trim();
    if (clean === setup.name) return setNameError(null);
    if (clean.length < 1 || clean.length > SETUP_NAME_MAX) {
      return setNameError(NAME_LENGTH);
    }
    rename.mutate({ id: setup.id, name: clean });
  };

  const addTrigger = () => {
    const clean = trigger.trim();
    if (clean.length < 1 || clean.length > ENTRY_TRIGGER_MAX) {
      setTriggerError(`a trigger is 1 to ${ENTRY_TRIGGER_MAX} characters`);
      return;
    }
    const taken = setup.triggers.some(
      t => t.toLowerCase() === clean.toLowerCase()
    );
    if (!taken) {
      update.mutate({ id: setup.id, triggers: [...setup.triggers, clean] });
    }
    setTrigger("");
    setTriggerError(null);
  };

  return (
    <div className="space-y-10">
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={event => setName(event.target.value)}
          onBlur={saveName}
          onKeyDown={event => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          aria-label="setup name"
          maxLength={SETUP_NAME_MAX}
          className="text-heading w-full bg-transparent border-0 border-b border-transparent hover:border-border focus:border-foreground focus:outline-none px-0"
        />
        <p className="text-label tabular-nums">
          {nameError ?? `used by ${entriesWord(setup.usageCount)}`}
        </p>
      </div>

      <Block label="entry triggers">
        <ul className="flex flex-wrap gap-2">
          {setup.triggers.map(t => (
            <li
              key={t}
              className="inline-flex items-center gap-2 border border-border px-2 py-1 text-sm"
            >
              {t}
              <button
                type="button"
                onClick={() =>
                  update.mutate({
                    id: setup.id,
                    triggers: setup.triggers.filter(x => x !== t),
                  })
                }
                aria-label={`remove trigger ${t}`}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
          <li>
            <input
              type="text"
              value={trigger}
              onChange={event => setTrigger(event.target.value)}
              onKeyDown={event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addTrigger();
              }}
              placeholder="+ trigger ⏎"
              aria-label="new entry trigger"
              maxLength={ENTRY_TRIGGER_MAX}
              className={cn(INPUT_CLASS, "w-48 py-1")}
            />
          </li>
        </ul>
        {triggerError && <p className="text-label">{triggerError}</p>}
      </Block>

      <Block label="description">
        <RichTextEditor
          owner={{ kind: "setup", id: setup.id }}
          content={setup.description}
          editable
          onSave={doc =>
            update.mutate({
              id: setup.id,
              description: isEmptyDoc(doc) ? null : doc,
            })
          }
          placeholder="what does the pattern look like? paste a chart."
        />
      </Block>

      <div className="flex items-baseline gap-4 border-t border-border pt-6">
        <button
          type="button"
          disabled={setup.usageCount > 0 || remove.isPending}
          onClick={() => setDeleting(true)}
          className="text-label hover:text-foreground disabled:opacity-50 disabled:hover:text-muted-foreground"
        >
          delete setup
        </button>
        {setup.usageCount > 0 && (
          <span className="text-label">
            used by {entriesWord(setup.usageCount)}; untag them first
          </span>
        )}
      </div>

      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>delete setup?</AlertDialogTitle>
            <AlertDialogDescription>
              this removes &quot;{setup.name}&quot;, its triggers and its
              description. it can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => remove.mutate({ id: setup.id })}>
              delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

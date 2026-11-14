import { imageUploadError, uploadImage, type ImageOwner } from "@/lib/images";
import { cn } from "@/lib/utils";
import { IMAGE_MIME_TYPES, SLOT_IMAGE_MAX } from "@shared/const";
import { X } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

type Pending = { key: number; previewUrl: string };

/**
 * Screenshot slot outside rich text: paste on the focused button, drop on
 * the wrapper, or pick files. Holds only pending previews; the saved ids
 * come from `imageIds`.
 */
export function ImageSlot({
  imageIds,
  owner,
  editable,
  onAdd,
  onRemove,
}: {
  imageIds: number[];
  owner: ImageOwner;
  editable: boolean;
  onAdd: (imageId: number) => Promise<unknown>;
  onRemove: (imageId: number) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const [pending, setPending] = useState<Pending[]>([]);
  const [removing, setRemoving] = useState<number | null>(null);
  const [over, setOver] = useState(false);

  const addFiles = async (files: File[]) => {
    const valid = files.filter(file => {
      const error = imageUploadError(file);
      if (error) toast.error(error);
      return !error;
    });
    const room = SLOT_IMAGE_MAX - imageIds.length - pending.length;
    if (valid.length > room) {
      toast.error(`a slot holds at most ${SLOT_IMAGE_MAX} screenshots`);
    }
    const batch = valid.slice(0, Math.max(room, 0)).map(file => ({
      file,
      key: nextKey.current++,
      previewUrl: URL.createObjectURL(file),
    }));
    if (batch.length === 0) return;
    setPending(current => [
      ...current,
      ...batch.map(({ key, previewUrl }) => ({ key, previewUrl })),
    ]);

    // One at a time so several files land in the order they came in.
    for (const item of batch) {
      try {
        const { id } = await uploadImage(item.file, owner);
        if (!imageIds.includes(id)) await onAdd(id);
      } catch (error) {
        toast.error(
          `image upload failed: ${error instanceof Error ? error.message : "unknown error"}`
        );
      } finally {
        URL.revokeObjectURL(item.previewUrl);
        setPending(current => current.filter(p => p.key !== item.key));
      }
    }
  };

  const remove = async (imageId: number) => {
    setRemoving(imageId);
    try {
      await onRemove(imageId);
    } catch (error) {
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : "failed to remove screenshot"
      );
    } finally {
      setRemoving(null);
    }
  };

  if (!editable && imageIds.length === 0) {
    return <p className="text-sm text-muted-foreground">no screenshots.</p>;
  }

  return (
    <div
      className="space-y-3"
      onDragOver={
        editable
          ? event => {
              if (!event.dataTransfer.types.includes("Files")) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              setOver(true);
            }
          : undefined
      }
      onDragLeave={
        editable
          ? event => {
              const next = event.relatedTarget;
              if (next instanceof Node && event.currentTarget.contains(next)) {
                return;
              }
              setOver(false);
            }
          : undefined
      }
      onDrop={
        editable
          ? event => {
              event.preventDefault();
              setOver(false);
              addFiles(Array.from(event.dataTransfer.files));
            }
          : undefined
      }
    >
      {(imageIds.length > 0 || pending.length > 0) && (
        <ul className="flex flex-wrap gap-3">
          {imageIds.map(id => (
            <li key={id} className="relative group">
              <a
                href={`/api/images/${id}`}
                target="_blank"
                rel="noreferrer"
                className="block"
                aria-label="open screenshot"
              >
                <img
                  src={`/api/images/${id}`}
                  alt=""
                  className="h-28 w-auto border border-border object-cover"
                />
              </a>
              {editable && (
                <button
                  type="button"
                  onClick={() => remove(id)}
                  disabled={removing === id}
                  aria-label="remove screenshot"
                  className="absolute top-1 right-1 bg-background border border-border p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </li>
          ))}
          {pending.map(item => (
            <li key={`pending-${item.key}`}>
              <img
                src={item.previewUrl}
                alt="uploading"
                className="h-28 w-auto border border-border object-cover opacity-40"
              />
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <>
          <button
            type="button"
            onPaste={event => {
              const files = Array.from(event.clipboardData.files);
              if (files.length === 0) return; // leave text pastes alone
              event.preventDefault();
              addFiles(files);
            }}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "w-full border border-dashed border-border px-4 py-3 text-left text-label hover:text-foreground focus:outline-none focus-visible:border-foreground focus-visible:text-foreground transition-colors",
              over && "border-foreground text-foreground"
            )}
          >
            paste, drop or click to choose
          </button>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            multiple
            hidden
            onChange={event => {
              addFiles(Array.from(event.target.files ?? []));
              event.target.value = "";
            }}
          />
        </>
      )}
    </div>
  );
}

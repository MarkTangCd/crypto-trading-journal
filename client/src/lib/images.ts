import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type ImageOwnerKind,
} from "@shared/const";

export type ImageOwner = { kind: ImageOwnerKind; id: number };

/** Why `file` cannot be uploaded, or undefined when it can. */
export function imageUploadError(file: File): string | undefined {
  if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not an image`;
  }
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} is over 10 mb`;
  return undefined;
}

/** POST raw bytes to /api/images; resolves to the stored id and its URL. */
export async function uploadImage(
  file: File,
  owner: ImageOwner
): Promise<{ id: number; url: string }> {
  const query = new URLSearchParams({
    ownerKind: owner.kind,
    ownerId: String(owner.id),
  });
  const response = await fetch(`/api/images?${query}`, {
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
  return { id: body.id, url: `/api/images/${body.id}` };
}

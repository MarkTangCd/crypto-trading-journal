import type {
  ErrorRequestHandler,
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import express, { Router as makeRouter } from "express";
import { createHash } from "node:crypto";
import { z } from "zod";
import {
  IMAGE_MIME_TYPES,
  IMAGE_OWNER_KINDS,
  MAX_IMAGE_BYTES,
  type ImageOwnerKind,
} from "@shared/const";
import {
  findImageBySha,
  getImage,
  getJournalEntryRow,
  getPlanRow,
  getSetupRow,
  insertImage,
} from "../db";
import { createContext } from "./context";

type ImageMime = (typeof IMAGE_MIME_TYPES)[number];

const idSchema = z.coerce.number().int().positive();
const ownerKindSchema = z.enum(IMAGE_OWNER_KINDS);

// WHATWG MIME Sniffing §6.1 image patterns; null bytes are wildcards (the
// RIFF chunk size of a WebP file).
const ascii = (text: string) => [...Buffer.from(text, "latin1")];
const SIGNATURES: { mime: ImageMime; pattern: (number | null)[] }[] = [
  { mime: "image/png", pattern: [0x89, ...ascii("PNG\r\n\x1a\n")] },
  { mime: "image/jpeg", pattern: [0xff, 0xd8, 0xff] },
  { mime: "image/gif", pattern: ascii("GIF87a") },
  { mime: "image/gif", pattern: ascii("GIF89a") },
  {
    mime: "image/webp",
    pattern: [...ascii("RIFF"), null, null, null, null, ...ascii("WEBPVP")],
  },
];

function sniffImageMime(bytes: Buffer): ImageMime | undefined {
  return SIGNATURES.find(
    ({ pattern }) =>
      bytes.length >= pattern.length &&
      pattern.every((byte, i) => byte === null || bytes[i] === byte)
  )?.mime;
}

// Why the owner cannot take a new image, or undefined when it can.
async function ownerRejection(
  userId: number,
  ownerKind: ImageOwnerKind,
  ownerId: number
): Promise<{ status: 404 | 409; error: string } | undefined> {
  switch (ownerKind) {
    case "plan": {
      const plan = await getPlanRow(userId, ownerId);
      if (!plan) return { status: 404, error: "plan not found" };
      if (plan.closedAt !== null)
        return { status: 409, error: "plan is closed" };
      return undefined;
    }
    case "journal_entry": {
      const entry = await getJournalEntryRow(userId, ownerId);
      if (!entry) return { status: 404, error: "journal entry not found" };
      if (entry.reviewedAt !== null) {
        return { status: 409, error: "journal entry is reviewed" };
      }
      return undefined;
    }
    case "setup": {
      const setup = await getSetupRow(userId, ownerId);
      if (!setup) return { status: 404, error: "setup not found" };
      return undefined;
    }
  }
}

async function resolveUserId(req: Request, res: Response): Promise<number> {
  const ctx = await createContext({ req, res, info: undefined as never });
  return ctx.user.id;
}

// Turns body-parser failures (413 entity.too.large, aborted uploads) into
// JSON instead of Express's HTML error page.
const handleError: ErrorRequestHandler = (err, _req, res, _next) => {
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number(err.status)
      : 500;
  if (status >= 400 && status < 500) {
    const type =
      typeof err === "object" && err !== null && "type" in err
        ? String(err.type)
        : "bad request";
    res.status(status).json({ error: type });
    return;
  }
  console.error("[Images] request failed", err);
  res.status(500).json({ error: "image request failed" });
};

/**
 * Mounts `POST /api/images?ownerKind=K&ownerId=N` (raw image bytes) and
 * `GET /api/images/:id`. Plain Express because tRPC cannot carry binary
 * bodies; see decision-3. Shares user resolution with tRPC via
 * `createContext`, like the SSE routes.
 */
export function mountImageRoutes(): Router {
  const router = makeRouter();

  router.post(
    "/",
    express.raw({
      type: [...IMAGE_MIME_TYPES],
      limit: MAX_IMAGE_BYTES,
      inflate: false,
    }),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const parsedKind = ownerKindSchema.safeParse(req.query.ownerKind);
        if (!parsedKind.success) {
          res.status(400).json({ error: "invalid ownerKind" });
          return;
        }
        const parsedId = idSchema.safeParse(req.query.ownerId);
        if (!parsedId.success) {
          res.status(400).json({ error: "invalid ownerId" });
          return;
        }
        const ownerKind = parsedKind.data;
        const ownerId = parsedId.data;

        const userId = await resolveUserId(req, res);
        const rejection = await ownerRejection(userId, ownerKind, ownerId);
        if (rejection) {
          res.status(rejection.status).json({ error: rejection.error });
          return;
        }

        // Without an allowed Content-Type, express.raw skips and body stays {}.
        if (!Buffer.isBuffer(req.body)) {
          res.status(415).json({ error: "unsupported content type" });
          return;
        }
        const bytes = req.body;
        const mime = sniffImageMime(bytes);
        if (!mime) {
          res.status(415).json({ error: "unsupported image format" });
          return;
        }

        const sha256 = createHash("sha256").update(bytes).digest("hex");
        const existing = await findImageBySha(
          userId,
          ownerKind,
          ownerId,
          sha256
        );
        if (existing) {
          res.status(200).json({ id: existing.id });
          return;
        }

        try {
          const { id } = await insertImage({
            userId,
            ownerKind,
            ownerId,
            sha256,
            mime,
            size: bytes.length,
            bytes,
          });
          res.status(201).json({ id });
        } catch (error) {
          // A concurrent upload of the same bytes won the unique index.
          const raced = await findImageBySha(
            userId,
            ownerKind,
            ownerId,
            sha256
          );
          if (!raced) throw error;
          res.status(200).json({ id: raced.id });
        }
      } catch (error) {
        // Express 4 does not forward rejected async handlers on its own.
        next(error);
      }
    }
  );

  router.get(
    "/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = idSchema.safeParse(req.params.id);
        if (!id.success) {
          res.sendStatus(404);
          return;
        }

        const userId = await resolveUserId(req, res);
        const image = await getImage(userId, id.data);
        if (!image) {
          res.sendStatus(404);
          return;
        }

        // Rows are insert-only and dedupe reuses ids, so an id maps to one
        // byte sequence forever: a strong ETag and immutable caching are safe.
        res.set({
          "Content-Type": image.mime,
          ETag: `"${image.sha256}"`,
          "Cache-Control": "private, max-age=31536000, immutable",
          "X-Content-Type-Options": "nosniff",
        });
        res.send(image.bytes);
      } catch (error) {
        next(error);
      }
    }
  );

  router.use(handleError);
  // Keep unmatched /api/images paths off the SPA catch-all.
  router.use((_req, res) => {
    res.sendStatus(404);
  });

  return router;
}

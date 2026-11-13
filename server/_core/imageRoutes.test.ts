import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import express from "express";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createHash } from "node:crypto";
import { MAX_IMAGE_BYTES, type ImageOwnerKind } from "@shared/const";

type StoredImage = {
  id: number;
  userId: number;
  ownerKind: ImageOwnerKind;
  ownerId: number;
  sha256: string;
  mime: string;
  size: number;
  bytes: Buffer;
};

// In-memory stand-in for the owner and image db functions. User 1 is the
// request user; owner 2 of each kind belongs to user 2; plan 3 is closed and
// journal entry 3 is reviewed.
const store = vi.hoisted(() => ({
  plans: [] as { id: number; userId: number; closedAt: Date | null }[],
  entries: [] as { id: number; userId: number; reviewedAt: Date | null }[],
  setups: [] as { id: number; userId: number }[],
  images: [] as StoredImage[],
  failNextInsert: false,
}));

vi.mock("../db", () => ({
  getOrCreateAnonymousUser: vi.fn(async () => ({ id: 1 })),
  getPlanRow: vi.fn(async (userId: number, planId: number) =>
    store.plans.find(p => p.id === planId && p.userId === userId)
  ),
  getJournalEntryRow: vi.fn(async (userId: number, entryId: number) =>
    store.entries.find(e => e.id === entryId && e.userId === userId)
  ),
  getSetupRow: vi.fn(async (userId: number, setupId: number) =>
    store.setups.find(s => s.id === setupId && s.userId === userId)
  ),
  findImageBySha: vi.fn(
    async (
      userId: number,
      ownerKind: ImageOwnerKind,
      ownerId: number,
      sha256: string
    ) => {
      const hit = store.images.find(
        i =>
          i.userId === userId &&
          i.ownerKind === ownerKind &&
          i.ownerId === ownerId &&
          i.sha256 === sha256
      );
      return hit ? { id: hit.id } : undefined;
    }
  ),
  insertImage: vi.fn(async (row: Omit<StoredImage, "id">) => {
    const id = store.images.length + 1;
    store.images.push({ ...row, id });
    if (store.failNextInsert) {
      // Simulate a concurrent upload that won the unique index.
      store.failNextInsert = false;
      throw new Error("Failed query: UNIQUE constraint failed");
    }
    return { id };
  }),
  getImage: vi.fn(async (userId: number, imageId: number) => {
    const hit = store.images.find(i => i.id === imageId && i.userId === userId);
    return hit
      ? { mime: hit.mime, sha256: hit.sha256, bytes: hit.bytes }
      : undefined;
  }),
}));

const { mountImageRoutes } = await import("./imageRoutes");

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9]);
const GIF = Buffer.from("GIF89a-body", "latin1");
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "latin1"),
  Buffer.from([0x24, 0, 0, 0]),
  Buffer.from("WEBPVP8 ", "latin1"),
]);

let server: Server;
let port: number;

type Reply = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
};

// node:http rather than fetch: Node's fetch adds `Cache-Control: no-cache`,
// which makes Express treat every conditional GET as stale.
function send(
  method: string,
  path: string,
  options: { body?: Buffer; headers?: Record<string, string> } = {}
): Promise<Reply> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method, path, headers: options.headers },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          })
        );
      }
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

type Owner = { kind: string; id: string | number };
const PLAN: Owner = { kind: "plan", id: 1 };

const post = (query: string, body: Buffer, type = "image/png") =>
  send("POST", `/api/images?${query}`, {
    body,
    headers: { "content-type": type },
  });

const upload = (owner: Owner, body: Buffer, type?: string) =>
  post(`ownerKind=${owner.kind}&ownerId=${owner.id}`, body, type);

const json = (reply: Reply) => JSON.parse(reply.body.toString("utf-8"));

beforeAll(async () => {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/images", mountImageRoutes());
  // Stand-in for the Vite / static SPA catch-all.
  app.use("*", (_req, res) => {
    res.status(200).send("<html>spa</html>");
  });
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  store.plans = [
    { id: 1, userId: 1, closedAt: null },
    { id: 2, userId: 2, closedAt: null },
    { id: 3, userId: 1, closedAt: new Date() },
  ];
  store.entries = [
    { id: 1, userId: 1, reviewedAt: null },
    { id: 2, userId: 2, reviewedAt: null },
    { id: 3, userId: 1, reviewedAt: new Date() },
  ];
  store.setups = [
    { id: 1, userId: 1 },
    { id: 2, userId: 2 },
  ];
  store.images = [];
  store.failNextInsert = false;
});

describe("POST /api/images", () => {
  it("stores a new image with 201 and its sniffed metadata", async () => {
    const reply = await upload(PLAN, PNG);
    expect(reply.status).toBe(201);
    expect(json(reply)).toEqual({ id: 1 });
    expect(store.images[0]).toMatchObject({
      userId: 1,
      ownerKind: "plan",
      ownerId: 1,
      mime: "image/png",
      size: PNG.length,
      sha256: createHash("sha256").update(PNG).digest("hex"),
    });
    expect(Buffer.compare(store.images[0].bytes, PNG)).toBe(0);
  });

  it.each(["journal_entry", "setup"])(
    "stores an image owned by a %s",
    async kind => {
      const reply = await upload({ kind, id: 1 }, PNG);
      expect(reply.status).toBe(201);
      expect(store.images[0]).toMatchObject({ ownerKind: kind, ownerId: 1 });
    }
  );

  it("dedupes the same bytes within a plan with 200 and the same id", async () => {
    const first = await upload(PLAN, PNG);
    const second = await upload(PLAN, PNG);
    expect(second.status).toBe(200);
    expect(json(second)).toEqual(json(first));
    expect(store.images).toHaveLength(1);
  });

  it("stores the same bytes under another owner as a new row", async () => {
    await upload(PLAN, PNG);
    const reply = await upload({ kind: "journal_entry", id: 1 }, PNG);
    expect(reply.status).toBe(201);
    expect(json(reply)).toEqual({ id: 2 });
    expect(store.images).toHaveLength(2);
  });

  it("re-selects after losing a unique-index race", async () => {
    store.failNextInsert = true;
    const reply = await upload(PLAN, PNG);
    expect(reply.status).toBe(200);
    expect(json(reply)).toEqual({ id: 1 });
  });

  it("stores the sniffed type, not the claimed Content-Type", async () => {
    await upload(PLAN, PNG, "image/jpeg");
    await upload(PLAN, JPEG, "image/png");
    await upload(PLAN, GIF, "image/webp");
    await upload(PLAN, WEBP, "image/gif");
    expect(store.images.map(i => i.mime)).toEqual([
      "image/png",
      "image/jpeg",
      "image/gif",
      "image/webp",
    ]);
  });

  it.each(["", "abc", "0", "-1", "1.5"])(
    "answers 400 for ownerId %j",
    async ownerId => {
      const reply = await upload({ kind: "plan", id: ownerId }, PNG);
      expect(reply.status).toBe(400);
      expect(json(reply)).toHaveProperty("error");
    }
  );

  it.each(["", "Plan", "journal-entry", "trade"])(
    "answers 400 for ownerKind %j",
    async kind => {
      const reply = await upload({ kind, id: 1 }, PNG);
      expect(reply.status).toBe(400);
      expect(json(reply)).toHaveProperty("error");
    }
  );

  it("answers 400 without an ownerKind", async () => {
    expect((await post("ownerId=1", PNG)).status).toBe(400);
    expect((await post("planId=1", PNG)).status).toBe(400);
  });

  it.each(["plan", "journal_entry", "setup"])(
    "answers 404 for an unknown or foreign %s",
    async kind => {
      expect((await upload({ kind, id: 99 }, PNG)).status).toBe(404);
      expect((await upload({ kind, id: 2 }, PNG)).status).toBe(404);
      expect(store.images).toHaveLength(0);
    }
  );

  it("answers 409 for a closed plan", async () => {
    const reply = await upload({ kind: "plan", id: 3 }, PNG);
    expect(reply.status).toBe(409);
    expect(json(reply)).toHaveProperty("error");
  });

  it("answers 409 for a reviewed journal entry", async () => {
    const reply = await upload({ kind: "journal_entry", id: 3 }, PNG);
    expect(reply.status).toBe(409);
    expect(json(reply)).toHaveProperty("error");
    expect(store.images).toHaveLength(0);
  });

  it("answers 415 for a disallowed Content-Type", async () => {
    expect((await upload(PLAN, PNG, "image/svg+xml")).status).toBe(415);
    expect((await upload(PLAN, PNG, "application/octet-stream")).status).toBe(
      415
    );
  });

  it("answers 415 when the magic bytes match no allowed image", async () => {
    const reply = await upload(PLAN, Buffer.from("hello"), "image/png");
    expect(reply.status).toBe(415);
    expect(json(reply)).toHaveProperty("error");
    expect(store.images).toHaveLength(0);
  });

  it("accepts exactly MAX_IMAGE_BYTES and answers 413 JSON above it", async () => {
    const atLimit = Buffer.alloc(MAX_IMAGE_BYTES);
    PNG.copy(atLimit);
    expect((await upload(PLAN, atLimit)).status).toBe(201);

    const over = Buffer.alloc(MAX_IMAGE_BYTES + 1);
    PNG.copy(over);
    const reply = await upload(PLAN, over);
    expect(reply.status).toBe(413);
    expect(reply.headers["content-type"]).toMatch(/application\/json/);
    expect(json(reply)).toEqual({ error: "entity.too.large" });
  });
});

describe("GET /api/images/:id", () => {
  it("serves the bytes with immutable caching headers", async () => {
    await upload(PLAN, PNG);
    const reply = await send("GET", "/api/images/1");
    expect(reply.status).toBe(200);
    expect(Buffer.compare(reply.body, PNG)).toBe(0);
    expect(reply.headers["content-type"]).toBe("image/png");
    expect(reply.headers.etag).toBe(`"${store.images[0].sha256}"`);
    expect(reply.headers["cache-control"]).toBe(
      "private, max-age=31536000, immutable"
    );
    expect(reply.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("answers 304 on a matching If-None-Match", async () => {
    await upload(PLAN, PNG);
    const reply = await send("GET", "/api/images/1", {
      headers: { "if-none-match": `"${store.images[0].sha256}"` },
    });
    expect(reply.status).toBe(304);
    expect(reply.body).toHaveLength(0);
  });

  it("answers 404 for non-integer, unknown and foreign ids", async () => {
    store.images.push({
      id: 7,
      userId: 2,
      ownerKind: "plan",
      ownerId: 2,
      sha256: "x",
      mime: "image/png",
      size: 1,
      bytes: Buffer.from([1]),
    });
    expect((await send("GET", "/api/images/abc")).status).toBe(404);
    expect((await send("GET", "/api/images/999")).status).toBe(404);
    expect((await send("GET", "/api/images/7")).status).toBe(404);
  });

  it("keeps unmatched /api/images paths off the SPA catch-all", async () => {
    const reply = await send("GET", "/api/images/");
    expect(reply.status).toBe(404);
    expect(reply.body.toString()).not.toContain("spa");
    expect((await send("GET", "/api/images/1/extra")).status).toBe(404);
  });
});

describe("JSON body limit", () => {
  it("still answers 413 for a JSON body over 1 mb", async () => {
    const reply = await send("POST", "/api/other", {
      body: Buffer.from(JSON.stringify({ x: "a".repeat(1024 * 1024 + 10) })),
      headers: { "content-type": "application/json" },
    });
    expect(reply.status).toBe(413);
  });
});

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
import { AddressInfo } from "net";
import type { Server } from "http";

const fakeUser = {
  id: 1,
  openId: "anon",
  email: null,
  name: "anon",
  loginMethod: "anonymous",
  role: "user" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

vi.mock("./db", () => ({
  getOrCreateAnonymousUser: vi.fn().mockResolvedValue(fakeUser),
  listMessages: vi.fn().mockResolvedValue([
    {
      id: 1,
      conversationId: 99,
      role: "system" as const,
      content: JSON.stringify({ text: "system" }),
      createdAt: new Date(1),
    },
    {
      id: 2,
      conversationId: 99,
      role: "user" as const,
      content: JSON.stringify({ text: "ctx" }),
      createdAt: new Date(2),
    },
    {
      id: 3,
      conversationId: 99,
      role: "assistant" as const,
      content: JSON.stringify({ text: "initial" }),
      createdAt: new Date(3),
    },
  ]),
  appendMessage: vi
    .fn()
    .mockImplementation(async (params: { role: string }) => ({
      id: params.role === "assistant" ? 11 : 10,
      conversationId: 99,
      role: params.role,
      content: "",
      createdAt: new Date(),
    })),
  getAgentSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/secrets", () => ({
  getProviderApiKey: vi.fn().mockResolvedValue("test-key"),
  getProviderBaseUrl: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./agents/providers/deepseek", () => ({
  deepseekProvider: {
    id: "deepseek",
    defaultModel: "deepseek-chat",
    chat: vi.fn(),
    chatStream: vi.fn().mockImplementation(async function* () {
      yield { delta: "hi " };
      yield { delta: "there" };
    }),
  },
}));

const { mountReviewAgentSseRoute } =
  await import("./_core/reviewAgentSseRoute");

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/review-agent", mountReviewAgentSseRoute());
  await new Promise<void>(resolve => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

beforeEach(() => {
  // Don't clear MOCK IMPLEMENTATIONS — those are needed across tests for the
  // mocked db / provider. Just reset call counts.
  vi.clearAllMocks();
});

async function readSseEvents(
  body: ReadableStream<Uint8Array>
): Promise<Array<Record<string, unknown>>> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<Record<string, unknown>> = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let blank: number;
    while ((blank = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, blank);
      buffer = buffer.slice(blank + 2);
      for (const line of raw.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trimStart();
        try {
          events.push(JSON.parse(data) as Record<string, unknown>);
        } catch {
          // ignore
        }
      }
    }
  }
  return events;
}

describe("POST /api/review-agent/stream (Express SSE)", () => {
  it("emits at least one delta event and a terminating done event", async () => {
    const res = await fetch(`${baseUrl}/api/review-agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: 99, userText: "ask" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.body).toBeTruthy();
    const events = await readSseEvents(res.body!);

    const deltas = events.filter(e => e.type === "delta");
    expect(deltas.length).toBeGreaterThanOrEqual(1);
    expect(deltas[0]).toEqual({ type: "delta", text: "hi " });

    const done = events.find(e => e.type === "done");
    expect(done).toBeDefined();
    expect(done).toMatchObject({ type: "done", messageId: expect.any(Number) });
  });

  it("returns 400 when the body fails zod validation", async () => {
    const res = await fetch(`${baseUrl}/api/review-agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: -1, userText: "" }),
    });
    expect(res.status).toBe(400);
  });
});

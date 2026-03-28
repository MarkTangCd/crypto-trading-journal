import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the database module to avoid node:sqlite import issues
vi.mock("./db", () => ({
  getUserById: vi.fn().mockResolvedValue({ id: 1, name: "Test User" }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: () => {},
    } as TrpcContext["res"],
  };
}

describe("tradingElement procedures", () => {
  it("should have create procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Verify the procedure exists
    expect(caller.tradingElement.create).toBeDefined();
  });

  it("should have list procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingElement.list).toBeDefined();
  });

  it("should have update procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingElement.update).toBeDefined();
  });

  it("should have delete procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingElement.delete).toBeDefined();
  });
});

describe("tradingSystem procedures", () => {
  it("should have create procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.create).toBeDefined();
  });

  it("should have list procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.list).toBeDefined();
  });

  it("should have update procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.update).toBeDefined();
  });

  it("should have delete procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.delete).toBeDefined();
  });

  it("should have activate procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.activate).toBeDefined();
  });

  it("should have deactivate procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.deactivate).toBeDefined();
  });

  it("should have getActive procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.tradingSystem.getActive).toBeDefined();
  });
});

describe("stats.getBySystem procedure", () => {
  it("should have getBySystem procedure defined", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    expect(caller.stats.getBySystem).toBeDefined();
  });
});

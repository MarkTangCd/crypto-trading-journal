import "dotenv/config";
import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { mountPreTradeAgentSseRoute } from "./preTradeAgentSseRoute";
import { mountReviewAgentSseRoute } from "./reviewAgentSseRoute";
import { serveStatic, setupVite } from "./vite";

// Route all outbound fetch() through HTTPS_PROXY / HTTP_PROXY when set, with
// NO_PROXY honored as a bypass list. No-op when no proxy env vars exist, so
// the same line is safe in proxy-less environments.
setGlobalDispatcher(new EnvHttpProxyAgent());
if (process.env.HTTPS_PROXY || process.env.HTTP_PROXY) {
  console.log(
    `[proxy] outbound fetch via ${process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY}` +
      (process.env.NO_PROXY ? ` (bypass: ${process.env.NO_PROXY})` : "")
  );
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // tRPC payloads top out at a few KB; cap well under that to bound DoS surface.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // Streaming SSE endpoints for the review agent (post-trade) and the
  // pre-trade agent (pre-trade). httpBatchLink can't carry SSE, so both
  // agents mount plain Express routers next to tRPC.
  app.use("/api/review-agent", mountReviewAgentSseRoute());
  app.use("/api/pre-trade-agent", mountPreTradeAgentSseRoute());
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "127.0.0.1", () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

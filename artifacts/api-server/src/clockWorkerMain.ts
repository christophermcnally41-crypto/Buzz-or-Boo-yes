/**
 * Clock Worker — standalone process entry point
 *
 * Run this as a separate process so the tick schedule is independent of
 * API server restarts. The worker runs one immediate catch-up tick on
 * startup, then fires every TICK_MS milliseconds.
 *
 * A minimal HTTP health server listens on PORT (default 8082) so the
 * Replit artifact supervisor can confirm the process is alive without
 * coupling it to the API server lifecycle.
 *
 * Usage:
 *   node --enable-source-maps dist/clockWorkerMain.mjs
 */

import http from "node:http";
import { tick } from "./lib/clockWorker";
import { logger } from "./lib/logger";

const TICK_MS = 5 * 60 * 1000; // 5 minutes, same as clockWorker.ts

async function runTick(): Promise<void> {
  try {
    const result = await tick();
    if (result.archived > 0 || result.rolledForward > 0) {
      logger.warn(
        { archived: result.archived, rolledForward: result.rolledForward, scored: result.scored },
        "[clockWorkerMain] tick complete — markets processed",
      );
    }
  } catch (err) {
    logger.error({ err }, "[clockWorkerMain] tick failed");
  }
}

function startHealthServer(port: number): void {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", worker: "clock" }));
  });
  server.listen(port, () => {
    logger.info({ port }, "[clockWorkerMain] health server listening");
  });
}

async function main(): Promise<void> {
  const port = Number(process.env["PORT"] ?? 8082);
  logger.info({ intervalMs: TICK_MS, port }, "[clockWorkerMain] starting standalone clock worker");

  // Start health server so the artifact supervisor can confirm liveness
  startHealthServer(port);

  // Catch-up tick immediately on startup
  logger.info("[clockWorkerMain] running startup catch-up tick");
  await runTick();
  logger.info("[clockWorkerMain] startup catch-up tick complete");

  // Schedule regular ticks
  setInterval(() => {
    runTick();
  }, TICK_MS);
}

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("[clockWorkerMain] received SIGTERM, shutting down");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("[clockWorkerMain] received SIGINT, shutting down");
  process.exit(0);
});

main().catch((err) => {
  logger.error({ err }, "[clockWorkerMain] fatal error");
  process.exit(1);
});

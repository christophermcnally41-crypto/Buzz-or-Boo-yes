import app from "./app";
import { logger } from "./lib/logger";
import { pool } from "@workspace/db";
import { assertRequiredIndexes } from "./lib/assertRequiredIndexes";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

assertRequiredIndexes(pool)
  .then(() => {
    logger.info("Startup index checks passed.");
    app.listen(port, (err) => {
      if (err) {
        logger.error({ err }, "Error listening on port");
        process.exit(1);
      }

      logger.info({ port }, "Server listening");
    });
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    logger.fatal({ err }, `Startup index check failed: ${message}`);
    process.exit(1);
  });

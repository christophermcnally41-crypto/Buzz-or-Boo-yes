import { Router } from "express";
import { db } from "@workspace/db";
import { pollsTable, pollVotesTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";

const pollsRouter = Router();

// GET /polls — list all open polls with tally
pollsRouter.get("/polls", async (_req, res) => {
  const polls = await db
    .select()
    .from(pollsTable)
    .where(eq(pollsTable.status, "OPEN"))
    .orderBy(pollsTable.createdAt);

  const tallyRows = await db
    .select({
      pollId: pollVotesTable.pollId,
      optionKey: pollVotesTable.optionKey,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(pollVotesTable)
    .groupBy(pollVotesTable.pollId, pollVotesTable.optionKey);

  const tallyMap: Record<number, Record<string, number>> = {};
  for (const row of tallyRows) {
    if (!tallyMap[row.pollId]) tallyMap[row.pollId] = {};
    tallyMap[row.pollId][row.optionKey] = row.count;
  }

  const result = polls.map(poll => {
    const tally = tallyMap[poll.id] ?? {};
    const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);
    return { ...poll, tally, totalVotes };
  });

  res.json({ polls: result });
});

// GET /polls/:id — single poll with tally
pollsRouter.get("/polls/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid poll id" }); return; }

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, id));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }

  const tallyRows = await db
    .select({
      optionKey: pollVotesTable.optionKey,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(pollVotesTable)
    .where(eq(pollVotesTable.pollId, id))
    .groupBy(pollVotesTable.optionKey);

  const tally: Record<string, number> = {};
  for (const row of tallyRows) tally[row.optionKey] = row.count;
  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);

  res.json({ poll: { ...poll, tally, totalVotes } });
});

// POST /polls/:id/vote — cast a vote
pollsRouter.post("/polls/:id/vote", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid poll id" }); return; }

  const { optionKey, fingerprint } = req.body as { optionKey?: string; fingerprint?: string };
  if (!optionKey) { res.status(400).json({ error: "optionKey is required" }); return; }

  const [poll] = await db.select().from(pollsTable).where(eq(pollsTable.id, id));
  if (!poll) { res.status(404).json({ error: "Poll not found" }); return; }
  if (poll.status !== "OPEN") { res.status(409).json({ error: "Poll is closed" }); return; }

  // Validate option key is valid
  const opts = poll.options as Array<{ key: string }>;
  if (!opts.some(o => o.key === optionKey)) {
    res.status(400).json({ error: "Invalid option key" });
    return;
  }

  await db.insert(pollVotesTable).values({ pollId: id, optionKey, fingerprint });

  // Return updated tally
  const tallyRows = await db
    .select({
      optionKey: pollVotesTable.optionKey,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(pollVotesTable)
    .where(eq(pollVotesTable.pollId, id))
    .groupBy(pollVotesTable.optionKey);

  const tally: Record<string, number> = {};
  for (const row of tallyRows) tally[row.optionKey] = row.count;
  const totalVotes = Object.values(tally).reduce((a, b) => a + b, 0);

  res.json({ success: true, tally, totalVotes });
});

export default pollsRouter;

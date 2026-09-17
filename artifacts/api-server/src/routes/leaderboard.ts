import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";

type StoredLeaderboardEntry = {
  playerId: string;
  displayName: string;
  score: number;
  updatedAt: Date;
};

type LeaderboardEntryResponse = {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  updatedAt: string;
};

const PLAYER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LEADERBOARD_ENTRIES = 10;

const adjectives = [
  "Clutch",
  "Skybound",
  "Baseline",
  "Downtown",
  "Fastbreak",
  "Fearless",
  "Fourth Quarter",
  "Full Court",
  "Prime",
  "Rim Rocking",
];

const mascots = [
  "Bison",
  "Falcon",
  "Giant",
  "Hawk",
  "Legend",
  "Panther",
  "Phantom",
  "Raptor",
  "Titan",
  "Wolf",
];

const memoryLeaderboard = new Map<string, StoredLeaderboardEntry>();
let databaseReady: Promise<void> | null = null;

function generatedDisplayName(playerId: string): string {
  const digest = createHash("sha256").update(playerId).digest();
  const adjective = adjectives[digest[0] % adjectives.length];
  const mascot = mascots[digest[1] % mascots.length];
  const number = (digest.readUInt16BE(2) % 90) + 10;

  return `${adjective} ${mascot} ${number}`;
}

function formatEntries(
  entries: readonly StoredLeaderboardEntry[],
): LeaderboardEntryResponse[] {
  return entries.map((entry, index) => ({
    rank: index + 1,
    playerId: entry.playerId,
    displayName: entry.displayName,
    score: Math.round(entry.score * 10) / 10,
    updatedAt: entry.updatedAt.toISOString(),
  }));
}

function sortedMemoryEntries(): StoredLeaderboardEntry[] {
  return [...memoryLeaderboard.values()]
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.updatedAt.getTime() - right.updatedAt.getTime(),
    )
    .slice(0, MAX_LEADERBOARD_ENTRIES);
}

async function getDatabasePool() {
  if (!process.env.SUPABASE_DATABASE_URL && !process.env.DATABASE_URL) {
    return null;
  }

  const { pool } = await import("@workspace/db");

  databaseReady ??= pool
    .query(
      `
      CREATE TABLE IF NOT EXISTS blind_five_leaderboard_entries (
        id SERIAL PRIMARY KEY,
        player_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    )
    .then(() =>
      pool.query(`
        CREATE INDEX IF NOT EXISTS blind_five_leaderboard_score_idx
        ON blind_five_leaderboard_entries (score DESC)
      `),
    )
    .then(() => undefined);

  await databaseReady;
  return pool;
}

async function readLeaderboard(): Promise<StoredLeaderboardEntry[]> {
  const pool = await getDatabasePool();

  if (!pool) {
    return sortedMemoryEntries();
  }

  const result = await pool.query<{
    player_id: string;
    display_name: string;
    score: number;
    updated_at: Date;
  }>(
    `SELECT player_id, display_name, score, updated_at
     FROM blind_five_leaderboard_entries
     ORDER BY score DESC, updated_at ASC
     LIMIT $1`,
    [MAX_LEADERBOARD_ENTRIES],
  );

  return result.rows.map((row) => ({
    playerId: row.player_id,
    displayName: row.display_name,
    score: row.score,
    updatedAt: row.updated_at,
  }));
}

async function submitScore(
  playerId: string,
  score: number,
): Promise<StoredLeaderboardEntry> {
  const displayName = generatedDisplayName(playerId);
  const pool = await getDatabasePool();

  if (!pool) {
    const existing = memoryLeaderboard.get(playerId);
    const entry =
      existing && existing.score >= score
        ? existing
        : { playerId, displayName, score, updatedAt: new Date() };

    memoryLeaderboard.set(playerId, entry);
    return entry;
  }

  const result = await pool.query<{
    player_id: string;
    display_name: string;
    score: number;
    updated_at: Date;
  }>(
    `INSERT INTO blind_five_leaderboard_entries
       (player_id, display_name, score)
     VALUES ($1, $2, $3)
     ON CONFLICT (player_id) DO UPDATE SET
       score = GREATEST(blind_five_leaderboard_entries.score, EXCLUDED.score),
       updated_at = CASE
         WHEN EXCLUDED.score > blind_five_leaderboard_entries.score THEN NOW()
         ELSE blind_five_leaderboard_entries.updated_at
       END
     RETURNING player_id, display_name, score, updated_at`,
    [playerId, displayName, score],
  );
  const row = result.rows[0];

  if (!row) {
    throw new Error("Leaderboard score was not saved");
  }

  return {
    playerId: row.player_id,
    displayName: row.display_name,
    score: row.score,
    updatedAt: row.updated_at,
  };
}

const router: IRouter = Router();

router.get("/leaderboard", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const entries = await readLeaderboard();
  res.json({ entries: formatEntries(entries) });
});

router.post("/leaderboard", async (req, res) => {
  const playerId = req.body?.playerId;
  const submittedScore = req.body?.score;

  if (typeof playerId !== "string" || !PLAYER_ID_PATTERN.test(playerId)) {
    res
      .status(400)
      .json({ message: "A valid anonymous player ID is required" });
    return;
  }

  if (
    typeof submittedScore !== "number" ||
    !Number.isFinite(submittedScore) ||
    submittedScore < 0 ||
    submittedScore > 100
  ) {
    res.status(400).json({ message: "Score must be between 0 and 100" });
    return;
  }

  const score = Math.round(submittedScore * 10) / 10;
  const entry = await submitScore(playerId, score);
  const entries = await readLeaderboard();
  const rankedEntries = formatEntries(entries);

  res.json({
    entry: {
      ...formatEntries([entry])[0],
      rank:
        rankedEntries.findIndex(
          (candidate) => candidate.playerId === playerId,
        ) + 1 || null,
    },
    entries: rankedEntries,
  });
});

export { generatedDisplayName };
export default router;

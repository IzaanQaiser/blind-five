import {
  index,
  pgTable,
  real,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const leaderboardEntriesTable = pgTable(
  "blind_five_leaderboard_entries",
  {
    id: serial("id").primaryKey(),
    playerId: text("player_id").notNull().unique(),
    displayName: text("display_name").notNull(),
    score: real("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("blind_five_leaderboard_score_idx").on(table.score)],
);

export type LeaderboardEntry = typeof leaderboardEntriesTable.$inferSelect;

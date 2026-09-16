import type { Player, Tier } from '@/types/player';

export const MAX_SCORE = 100;

export const PLAYER_TIER_POINTS: Readonly<Record<Tier, number>> = {
  ALL_TIMER: 20,
  ALL_STAR: 16,
  SOLID: 12,
  BENCH: 8,
  BUST: 4,
};

export const POWERUP_MULTIPLIERS = {
  0: 1,
  1: 0.95,
  2: 0.85,
  3: 0.7,
  4: 0.5,
} as const;

export interface PickScoreBreakdown {
  tier: Tier;
  basePoints: number;
  powerupsUsed: number;
  multiplier: number;
  score: number;
}

function assertPowerupCount(
  powerupsUsed: number,
): asserts powerupsUsed is 0 | 1 | 2 | 3 | 4 {
  if (!Number.isInteger(powerupsUsed) || powerupsUsed < 0 || powerupsUsed > 4) {
    throw new Error('Powerups used must be an integer from 0 to 4');
  }
}

export function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) {
    throw new Error('Score must be finite');
  }

  return Math.min(MAX_SCORE, Math.max(0, Math.round(score * 10) / 10));
}

export function calculatePickScore(
  tier: Tier,
  powerupsUsed: number,
): PickScoreBreakdown {
  assertPowerupCount(powerupsUsed);

  const basePoints = PLAYER_TIER_POINTS[tier];
  const multiplier = getPowerupMultiplier(powerupsUsed);

  return {
    tier,
    basePoints,
    powerupsUsed,
    multiplier,
    score: normalizeScore(basePoints * multiplier),
  };
}

export function getPowerupMultiplier(powerupsUsed: number): number {
  assertPowerupCount(powerupsUsed);
  return POWERUP_MULTIPLIERS[powerupsUsed];
}

export function calculateFinalScore(
  picks: readonly PickScoreBreakdown[],
): number {
  if (picks.length > 5) {
    throw new Error('A Blind Five score cannot contain more than five picks');
  }

  return normalizeScore(picks.reduce((total, pick) => total + pick.score, 0));
}

export function formatScore(score: number): string {
  return normalizeScore(score).toFixed(1);
}

export function getNextPersonalBest(
  personalBest: number | null,
  completedScore: number,
): number {
  const normalizedScore = normalizeScore(completedScore);

  if (personalBest === null) {
    return normalizedScore;
  }

  return Math.max(normalizeScore(personalBest), normalizedScore);
}

export function selectBestScoringPlayer(board: readonly Player[]): Player {
  if (board.length === 0) {
    throw new Error('Cannot select the best player from an empty board');
  }

  return board.reduce((bestPlayer, player) =>
    PLAYER_TIER_POINTS[player.tier] > PLAYER_TIER_POINTS[bestPlayer.tier]
      ? player
      : bestPlayer,
  );
}

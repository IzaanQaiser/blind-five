import { players } from '@/data/players';
import { POSITIONS, type Player, type Position, type Tier } from '@/types/player';

export const GAMES_PER_SEASON = 82;

export const TIER_VALUES: Readonly<Record<Tier, number>> = {
  ALL_TIMER: 5,
  ALL_STAR: 4,
  SOLID: 3,
  BENCH: 2,
  BUST: 1,
};

export const BUILD_RATING_BASELINES: Readonly<Record<Tier, number>> = {
  ALL_TIMER: 96,
  ALL_STAR: 88,
  SOLID: 80,
  BENCH: 72,
  BUST: 64,
};

export const PROJECTED_SEASON_CONFIG = {
  baseWins: 10,
  baselineRating: 55,
  winsPerRatingPoint: 1.45,
  minWins: 12,
  maxWins: 72,
} as const;

export interface ProjectedRecord {
  teamRating: number;
  wins: number;
  losses: number;
  classification: string;
  percentile: number;
}

type RatingDistribution = Map<number, number>;

const lineupRatingDistributionCache = new WeakMap<
  readonly Player[],
  RatingDistribution
>();

function assertCompleteLineup(lineup: readonly Player[]): void {
  if (lineup.length !== POSITIONS.length) {
    throw new Error(`A lineup requires exactly ${POSITIONS.length} players`);
  }

  const positions = new Set(lineup.map((player) => player.position));

  if (
    positions.size !== POSITIONS.length ||
    POSITIONS.some((position) => !positions.has(position))
  ) {
    throw new Error('A lineup requires exactly one player at every position');
  }
}

export function getPlayerBuildRating(player: Player): number {
  return Number.isFinite(player.buildRating)
    ? player.buildRating!
    : BUILD_RATING_BASELINES[player.tier];
}

export function getTeamRating(lineup: readonly Player[]): number {
  assertCompleteLineup(lineup);

  return (
    lineup.reduce((rating, player) => rating + getPlayerBuildRating(player), 0) /
    POSITIONS.length
  );
}

export function getProjectedWins(teamRating: number): number {
  if (!Number.isFinite(teamRating)) {
    throw new Error('Team rating must be finite');
  }

  const { baseWins, baselineRating, winsPerRatingPoint, minWins, maxWins } =
    PROJECTED_SEASON_CONFIG;

  return Math.min(
    maxWins,
    Math.max(
      minWins,
      Math.round(baseWins + (teamRating - baselineRating) * winsPerRatingPoint),
    ),
  );
}

export function getTeamClassification(wins: number): string {
  if (wins >= 70) {
    return 'HISTORIC';
  }

  if (wins >= 60) {
    return 'TITLE CONTENDER';
  }

  if (wins >= 50) {
    return '50-WIN TEAM';
  }

  if (wins >= 42) {
    return 'WINNING SEASON';
  }

  if (wins >= 35) {
    return 'PLAY-IN RANGE';
  }

  if (wins >= 25) {
    return 'LOTTERY TEAM';
  }

  return 'REBUILD';
}

function createPositionRatingDistribution(
  playerDatabase: readonly Player[],
  position: Position,
): RatingDistribution {
  const distribution: RatingDistribution = new Map();

  for (const player of playerDatabase) {
    if (player.position !== position) {
      continue;
    }

    const rating = getPlayerBuildRating(player);
    distribution.set(rating, (distribution.get(rating) ?? 0) + 1);
  }

  if (distribution.size === 0) {
    throw new Error(`Player database has no players at ${position}`);
  }

  return distribution;
}

function convolve(
  left: RatingDistribution,
  right: RatingDistribution,
): RatingDistribution {
  const result: RatingDistribution = new Map();

  for (const [leftRating, leftFrequency] of left) {
    for (const [rightRating, rightFrequency] of right) {
      const totalRating = leftRating + rightRating;
      result.set(
        totalRating,
        (result.get(totalRating) ?? 0) + leftFrequency * rightFrequency,
      );
    }
  }

  return result;
}

function getLineupRatingDistribution(
  playerDatabase: readonly Player[],
): RatingDistribution {
  const cached = lineupRatingDistributionCache.get(playerDatabase);

  if (cached) {
    return cached;
  }

  let distribution: RatingDistribution = new Map([[0, 1]]);

  for (const position of POSITIONS) {
    distribution = convolve(
      distribution,
      createPositionRatingDistribution(playerDatabase, position),
    );
  }

  lineupRatingDistributionCache.set(playerDatabase, distribution);
  return distribution;
}

export function getTeamPercentile(
  lineup: readonly Player[],
  playerDatabase: readonly Player[] = players,
): number {
  assertCompleteLineup(lineup);

  const totalRating = lineup.reduce(
    (rating, player) => rating + getPlayerBuildRating(player),
    0,
  );
  const distribution = getLineupRatingDistribution(playerDatabase);
  let lowerLineups = 0;
  let totalLineups = 0;

  for (const [rating, frequency] of distribution) {
    totalLineups += frequency;

    if (rating < totalRating) {
      lowerLineups += frequency;
    }
  }

  if (totalLineups === 0) {
    throw new Error('Player database has no valid lineups');
  }

  return Math.round((lowerLineups / totalLineups) * 100);
}

export function getTeamPercentileLabel(percentile: number): string {
  return `TOP ${Math.max(1, 100 - percentile)}%`;
}

export function getProjectedRecord(
  lineup: readonly Player[],
  playerDatabase: readonly Player[] = players,
): ProjectedRecord {
  const teamRating = getTeamRating(lineup);
  const wins = getProjectedWins(teamRating);

  return {
    teamRating,
    wins,
    losses: GAMES_PER_SEASON - wins,
    classification: getTeamClassification(wins),
    percentile: getTeamPercentile(lineup, playerDatabase),
  };
}

export function getDraftScore(lineup: readonly Player[]): number {
  assertCompleteLineup(lineup);

  return lineup.reduce((score, player) => score + player.tierValue, 0);
}

// Kept as a small compatibility alias for existing game modules.
export const calculateTeamScore = getDraftScore;
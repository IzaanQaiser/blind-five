import { players } from '@/data/players';
import {
  POSITIONS,
  TIERS,
  type Player,
  type Position,
  type Tier,
} from '@/types/player';

export type RandomSource = () => number;

export interface MysteryOption {
  optionId: string;
  hints: string[];
}

export interface MysteryRound {
  position: Position;
  options: MysteryOption[];
}

const playerIdsByRound = new WeakMap<MysteryRound, Map<string, string>>();

const weightedTiers: Array<{ tier: Tier; upperBound: number }> = [
  { tier: 'ALL_TIMER', upperBound: 0.05 },
  { tier: 'ALL_STAR', upperBound: 0.2 },
  { tier: 'SOLID', upperBound: 0.55 },
  { tier: 'BENCH', upperBound: 0.85 },
  { tier: 'BUST', upperBound: 1 },
];

function normalizeRandomValue(random: RandomSource): number {
  const value = random();

  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(Math.max(value, 0), 0.9999999999999999);
}

function shuffle<T>(items: readonly T[], random: RandomSource): T[] {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(
      normalizeRandomValue(random) * (index + 1),
    );
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function selectWeightedTier(random: RandomSource): Tier {
  const value = normalizeRandomValue(random);
  return (
    weightedTiers.find(({ upperBound }) => value < upperBound)?.tier ??
    'BUST'
  );
}

function selectRandomPlayer(
  candidates: readonly Player[],
  random: RandomSource,
): Player {
  if (candidates.length === 0) {
    throw new Error('Unable to select a player from an empty pool');
  }

  const playerIndex = Math.floor(
    normalizeRandomValue(random) * candidates.length,
  );
  return candidates[playerIndex];
}

export function createRound(
  position: Position,
  random: RandomSource = Math.random,
  guaranteeAllTimer = false,
): MysteryRound {
  const positionPlayers = players.filter(
    (player) => player.position === position,
  );

  if (positionPlayers.length < TIERS.length) {
    throw new Error(
      `Expected at least one player for every tier at position ${position}`,
    );
  }

  const selectedTiers = Array.from({ length: 5 }, () =>
    selectWeightedTier(random),
  );

  if (guaranteeAllTimer && !selectedTiers.includes('ALL_TIMER')) {
    const guaranteedSlot = Math.floor(
      normalizeRandomValue(random) * selectedTiers.length,
    );
    selectedTiers[guaranteedSlot] = 'ALL_TIMER';
  }

  const selectedPlayerIds = new Set<string>();
  const selectedPlayers = selectedTiers.map((tier) => {
    const playersInTier = positionPlayers.filter(
      (positionPlayer) =>
        positionPlayer.tier === tier && !selectedPlayerIds.has(positionPlayer.id),
    );

    const player = selectRandomPlayer(playersInTier, random);
    selectedPlayerIds.add(player.id);
    return player;
  });

  const shuffledPlayers = shuffle(selectedPlayers, random);
  const playerIds = new Map<string, string>();
  const options = shuffledPlayers.map((player, index) => {
    const optionId = `option-${index + 1}`;

    playerIds.set(optionId, player.id);

    return {
      optionId,
    hints: shuffle(
      [
          player.positiveHint,
          player.negativeHint,
          player.neutralHint,
      ],
      random,
    ),
    };
  });

  const round = {
    position,
    options,
  };

  playerIdsByRound.set(round, playerIds);
  return round;
}

export function applyFranchisePlayer(
  round: MysteryRound,
  random: RandomSource = Math.random,
): MysteryRound {
  if (!playerIdsByRound.has(round)) {
    throw new Error('Unable to resolve mystery round identity map');
  }

  return createRound(round.position, random, true);
}

export function resolveMysteryPlayer(
  round: MysteryRound,
  optionId: string,
) {
  const playerId = playerIdsByRound.get(round)?.get(optionId);
  return players.find((player) => player.id === playerId);
}

export { POSITIONS };
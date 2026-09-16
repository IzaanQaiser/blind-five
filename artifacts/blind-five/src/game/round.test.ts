import { expect, it } from 'vitest';

import { players } from '@/data/players';
import { POSITIONS, TIERS, type Player } from '@/types/player';

import {
  applyFranchisePlayer,
  createRound,
  resolveMysteryPlayer,
} from './round';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function constantRandom(value: number): () => number {
  return () => value;
}

function sequenceRandom(values: number[]): () => number {
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)];
}

function resolvedPlayers(round: ReturnType<typeof createRound>): Player[] {
  return round.options.map((option) => {
    const player = resolveMysteryPlayer(round, option.optionId);
    expect(player).toBeDefined();
    return player as Player;
  });
}

it('creates deterministic, complete mystery rounds for every position', () => {
  for (const position of POSITIONS) {
    const round = createRound(position, seededRandom(2026));
    const repeatedRound = createRound(position, seededRandom(2026));

    expect(round).toEqual(repeatedRound);
    expect(round.position).toBe(position);
    expect(round.options).toHaveLength(5);
    expect(new Set(round.options.map((option) => option.optionId)).size).toBe(
      5,
    );

    const roundPlayers = resolvedPlayers(round);

    expect(new Set(roundPlayers.map((player) => player.id)).size).toBe(5);

    for (const option of round.options) {
      expect(Object.keys(option).sort()).toEqual(['hints', 'optionId']);
      expect(option.optionId).toMatch(/^option-[1-5]$/);
      expect(option).not.toHaveProperty('name');
      expect(option).not.toHaveProperty('tier');
      expect(option.hints).toHaveLength(3);
      expect(option.hints.every((hint) => typeof hint === 'string')).toBe(true);
      expect(option.hints.every((hint) => hint.length > 0)).toBe(true);
    }

    const serializedRound = JSON.stringify(round).toLowerCase();
    expect(serializedRound).not.toContain('positive');
    expect(serializedRound).not.toContain('negative');
    expect(serializedRound).not.toContain('neutral');
    for (const player of players) {
      expect(serializedRound).not.toContain(player.id.toLowerCase());
    }
    for (const tier of TIERS) {
      expect(serializedRound.includes(tier.toLowerCase())).toBe(false);
    }
  }
});

it('allows duplicate tiers and guarantees an ALL_STAR-or-better player', () => {
  const allTimerRound = createRound(
    'PG',
    sequenceRandom([0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4]),
  );
  const bustRound = createRound(
    'PG',
    sequenceRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.1, 0.2, 0.3, 0.4]),
  );

  expect(
    resolvedPlayers(allTimerRound).every(
      (player) => player.tier === 'ALL_TIMER',
    ),
  ).toBe(true);
  expect(
    new Set(resolvedPlayers(allTimerRound).map((player) => player.id)).size,
  ).toBe(5);
  const lowRollPlayers = resolvedPlayers(bustRound);

  expect(
    lowRollPlayers.filter((player) => player.tier === 'BUST'),
  ).toHaveLength(4);
  expect(lowRollPlayers.some((player) => player.tier === 'ALL_STAR')).toBe(
    true,
  );
  expect(lowRollPlayers).toHaveLength(5);
});

it('guarantees an ALL_STAR-or-better player across positions and repeated draws', () => {
  for (const position of POSITIONS) {
    for (let seed = 0; seed < 100; seed += 1) {
      const roundPlayers = resolvedPlayers(
        createRound(position, seededRandom(seed)),
      );

      expect(
        roundPlayers.some(
          (player) => player.tier === 'ALL_STAR' || player.tier === 'ALL_TIMER',
        ),
      ).toBe(true);
    }
  }
});

it('selects a different tier composition from a different deterministic source', () => {
  const allTimerRound = createRound(
    'PG',
    sequenceRandom([0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4]),
  );
  const bustRound = createRound(
    'PG',
    sequenceRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.1, 0.2, 0.3, 0.4]),
  );

  expect(
    resolvedPlayers(allTimerRound).map((player) => player.tier),
  ).not.toEqual(resolvedPlayers(bustRound).map((player) => player.tier));
});

it('rerolls the full board and guarantees an ALL_TIMER with Franchise Player', () => {
  const round = createRound(
    'PG',
    sequenceRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.1, 0.2, 0.3, 0.4]),
  );
  const beforePlayers = resolvedPlayers(round);
  const nextRound = applyFranchisePlayer(round, constantRandom(0));
  const afterPlayers = resolvedPlayers(nextRound);

  expect(nextRound).not.toBe(round);
  expect(afterPlayers).toHaveLength(5);
  expect(new Set(afterPlayers.map((player) => player.id)).size).toBe(5);
  expect(afterPlayers.some((player) => player.tier === 'ALL_TIMER')).toBe(true);
  expect(afterPlayers.map((player) => player.id)).not.toEqual(
    beforePlayers.map((player) => player.id),
  );
  expect(nextRound.options.map((option) => option.optionId)).toEqual([
    'option-1',
    'option-2',
    'option-3',
    'option-4',
    'option-5',
  ]);
  expect(
    nextRound.options.every(
      (option) =>
        Object.keys(option).sort().join(',') === 'hints,optionId' &&
        !JSON.stringify(option).toLowerCase().includes('all_timer'),
    ),
  ).toBe(true);
});

it('rerolls even when the original board already contains an ALL_TIMER', () => {
  const round = createRound(
    'PG',
    sequenceRandom([0, 0, 0, 0, 0, 0, 0.1, 0.2, 0.3, 0.4]),
  );
  const beforeIds = resolvedPlayers(round).map((player) => player.id);
  const nextRound = applyFranchisePlayer(round, constantRandom(0.99));
  const afterPlayers = resolvedPlayers(nextRound);

  expect(nextRound).not.toBe(round);
  expect(afterPlayers).toHaveLength(5);
  expect(new Set(afterPlayers.map((player) => player.id)).size).toBe(5);
  expect(afterPlayers.some((player) => player.tier === 'ALL_TIMER')).toBe(true);
  expect(afterPlayers.map((player) => player.id)).not.toEqual(beforeIds);
  expect(nextRound.options.map((option) => option.optionId)).toEqual([
    'option-1',
    'option-2',
    'option-3',
    'option-4',
    'option-5',
  ]);
});

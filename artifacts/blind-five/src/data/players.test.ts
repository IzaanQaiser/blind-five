import { expect, it } from 'vitest';

import { players } from './players';
import {
  POSITIONS,
  SOURCE_TIERS,
  TIERS,
  type SourceTier,
} from '@/types/player';

it('validates the canonical CSV player pool shape', () => {
  expect(players).toHaveLength(350);
  expect(new Set(players.map((player) => player.id)).size).toBe(350);
  expect(
    new Set(
      players.map((player) =>
        [
          player.name,
          player.position,
          player.sourceTier,
          player.yearsActive,
        ].join('|'),
      ),
    ).size,
  ).toBe(350);

  const sourceTierCounts: Record<SourceTier, number> = {
    HALL_OF_FAMER: 5,
    ALL_STAR: 10,
    SOLID: 20,
    BENCH: 20,
    BUST: 15,
  };

  for (const position of POSITIONS) {
    const positionPlayers = players.filter(
      (player) => player.position === position,
    );

    expect(positionPlayers).toHaveLength(70);
    for (const tier of SOURCE_TIERS) {
      expect(
        positionPlayers.filter((player) => player.sourceTier === tier),
      ).toHaveLength(sourceTierCounts[tier]);
    }
  }

  for (const player of players) {
    expect(player.id.trim()).not.toBe('');
    expect(player.name).not.toBe('');
    expect(player.positiveHint).not.toBe('');
    expect(player.negativeHint).not.toBe('');
    expect(player.neutralHint).not.toBe('');
    expect(player.teamHint).not.toBe('');
    expect(player.yearsActive).not.toBe('');
    expect(player.scoutHint).not.toBe('');
    expect(player.extraHint1).not.toBe('');
    expect(player.extraHint2).not.toBe('');
    expect(Number.isFinite(player.recommendedDrawWeight)).toBe(true);
  }

  for (const tier of TIERS) {
    expect(players.some((player) => player.tier === tier)).toBe(true);
  }
});

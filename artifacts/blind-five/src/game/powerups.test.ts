import { expect, it } from 'vitest';

import {
  applyFranchisePlayer,
  createRound,
  resolveMysteryPlayer,
} from './round';
import {
  canUsePowerup,
  consumePowerup,
  createPowerupState,
  refreshPowerupReveals,
  resolvePowerupValues,
} from './powerups';

function sequenceRandom(values: number[]): () => number {
  let index = 0;

  return () => values[Math.min(index++, values.length - 1)];
}

function constantRandom(value: number): () => number {
  return () => value;
}

it('refreshes visible scouting values from the updated hidden round', () => {
  const round = createRound(
    'PG',
    sequenceRandom([0.99, 0.99, 0.99, 0.99, 0.99, 0, 0.1, 0.2, 0.3, 0.4]),
  );
  const reveals = {
    teamCheck: resolvePowerupValues(round, 'teamHint', resolveMysteryPlayer),
    timeline: resolvePowerupValues(
      round,
      'yearsActive',
      resolveMysteryPlayer,
    ),
    scout: resolvePowerupValues(round, 'scoutHint', resolveMysteryPlayer),
  };
  const nextRound = applyFranchisePlayer(round, constantRandom(0));
  const refreshed = refreshPowerupReveals(
    nextRound,
    reveals,
    resolveMysteryPlayer,
  );

  for (const option of nextRound.options) {
    const player = resolveMysteryPlayer(nextRound, option.optionId);

    expect(player).toBeDefined();
    expect(refreshed.teamCheck?.[option.optionId]).toBe(player?.teamHint);
    expect(refreshed.timeline?.[option.optionId]).toBe(player?.yearsActive);
    expect(refreshed.scout?.[option.optionId]).toBe(player?.scoutHint);
  }
});

it('consumes Franchise Player once and restores it in a fresh draft state', () => {
  const initialState = createPowerupState();

  expect(canUsePowerup('franchisePlayer', initialState, null)).toBe(true);

  const consumedState = consumePowerup(initialState, 'franchisePlayer');
  expect(consumedState.franchisePlayer).toBe(true);
  expect(canUsePowerup('franchisePlayer', consumedState, null)).toBe(false);
  expect(canUsePowerup('franchisePlayer', initialState, 'option-1')).toBe(false);
  expect(consumePowerup(consumedState, 'franchisePlayer')).toBe(consumedState);

  expect(createPowerupState().franchisePlayer).toBe(false);
});
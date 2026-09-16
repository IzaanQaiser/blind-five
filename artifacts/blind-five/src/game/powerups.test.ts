import { expect, it } from 'vitest';

import {
  applyFranchisePlayer,
  createRound,
  resolveMysteryPlayer,
} from './round';
import {
  canUsePowerup,
  countNewlyUsedPowerups,
  consumePowerup,
  createPowerupState,
  refreshPowerupReveals,
  resolveBoardPlayers,
  resolvePowerupValues,
} from './powerups';

it('counts powerups only on the current board after the baseline resets', () => {
  const draftStart = createPowerupState();
  const firstBoard = consumePowerup(
    consumePowerup(draftStart, 'teamCheck'),
    'timeline',
  );

  expect(countNewlyUsedPowerups(firstBoard, draftStart)).toBe(2);

  const secondBoard = consumePowerup(firstBoard, 'revealBoard');

  expect(countNewlyUsedPowerups(secondBoard, firstBoard)).toBe(1);
  expect(countNewlyUsedPowerups(secondBoard, secondBoard)).toBe(0);
});

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
    timeline: resolvePowerupValues(round, 'yearsActive', resolveMysteryPlayer),
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
  }
});

it('resolves every identity for the Reveal Board powerup', () => {
  const round = createRound('SG', constantRandom(0.4));
  const revealedPlayers = resolveBoardPlayers(round, resolveMysteryPlayer);

  expect(Object.keys(revealedPlayers)).toHaveLength(5);
  for (const option of round.options) {
    expect(revealedPlayers[option.optionId]).toBe(
      resolveMysteryPlayer(round, option.optionId),
    );
  }
});

it('consumes Franchise Player once and restores it in a fresh draft state', () => {
  const initialState = createPowerupState();

  expect(canUsePowerup('franchisePlayer', initialState, null)).toBe(true);

  const consumedState = consumePowerup(initialState, 'franchisePlayer');
  expect(consumedState.franchisePlayer).toBe(true);
  expect(canUsePowerup('franchisePlayer', consumedState, null)).toBe(false);
  expect(canUsePowerup('franchisePlayer', initialState, 'option-1')).toBe(
    false,
  );
  expect(consumePowerup(consumedState, 'franchisePlayer')).toBe(consumedState);

  expect(createPowerupState().franchisePlayer).toBe(false);
});

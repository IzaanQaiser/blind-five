import { expect, it } from 'vitest';

import {
  calculateFinalScore,
  calculatePickScore,
  formatScore,
  getNextPersonalBest,
  selectBestScoringPlayer,
} from './scoring';
import type { Player } from '@/types/player';

it.each([
  ['ALL_TIMER', 0, 20],
  ['ALL_TIMER', 1, 19],
  ['ALL_STAR', 2, 13.6],
  ['SOLID', 3, 8.4],
  ['BUST', 4, 2],
] as const)(
  'scores a %s pick with %i powerups as %f',
  (tier, powerupsUsed, expectedScore) => {
    expect(calculatePickScore(tier, powerupsUsed).score).toBe(expectedScore);
  },
);

it('returns exactly 100.0 for five blind All-Timer picks', () => {
  const picks = Array.from({ length: 5 }, () =>
    calculatePickScore('ALL_TIMER', 0),
  );

  expect(calculateFinalScore(picks)).toBe(100);
  expect(formatScore(calculateFinalScore(picks))).toBe('100.0');
});

it('cannot return 100.0 when any perfect-lineup pick used a powerup', () => {
  const picks = [
    calculatePickScore('ALL_TIMER', 1),
    ...Array.from({ length: 4 }, () => calculatePickScore('ALL_TIMER', 0)),
  ];

  expect(calculateFinalScore(picks)).toBe(99);
  expect(calculateFinalScore(picks)).toBeLessThan(100);
});

it.each([
  [0, '0.0'],
  [13.6, '13.6'],
  [74.2, '74.2'],
  [100, '100.0'],
] as const)('formats %f with exactly one decimal place', (score, formatted) => {
  expect(formatScore(score)).toBe(formatted);
});

it('updates a personal best only when the completed score is higher', () => {
  expect(getNextPersonalBest(null, 72.4)).toBe(72.4);
  expect(getNextPersonalBest(72.4, 68.8)).toBe(72.4);
  expect(getNextPersonalBest(72.4, 72.4)).toBe(72.4);
  expect(getNextPersonalBest(72.4, 84.7)).toBe(84.7);
  expect(getNextPersonalBest(100, 96)).toBe(100);
});

it('selects the highest-scoring player from a revealed board', () => {
  const createPlayer = (name: string, tier: Player['tier']): Player =>
    ({ name, tier }) as Player;
  const board = [
    createPlayer('Solid Player', 'SOLID'),
    createPlayer('All-Timer', 'ALL_TIMER'),
    createPlayer('All-Star', 'ALL_STAR'),
  ];

  expect(selectBestScoringPlayer(board).name).toBe('All-Timer');
});

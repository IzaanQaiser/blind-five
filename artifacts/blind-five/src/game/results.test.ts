import { expect, it } from 'vitest';

import { players } from '@/data/players';
import { POSITIONS, type Player, type Tier } from '@/types/player';

import {
  calculateDraftEfficiency,
  completeFinalBoardHistory,
  createDraftComparison,
  getBestAvailableLineup,
  recordFinalBoard,
  selectBestAvailablePlayer,
} from './results';
import {
  getDraftScore,
  getProjectedRecord,
  getTeamRating,
} from './scoring';

function playersForTiers(
  position: (typeof POSITIONS)[number],
  tiers: readonly Tier[],
): Player[] {
  const usedIds = new Set<string>();

  return tiers.map((tier) => {
    const player = players.find(
      (candidate) =>
        candidate.position === position &&
        candidate.tier === tier &&
        !usedIds.has(candidate.id),
    );

    if (!player) {
      throw new Error(`Missing ${tier} player for ${position}`);
    }

    usedIds.add(player.id);
    return player;
  });
}

function completeHistory(
  tiers: readonly Tier[] = [
    'ALL_TIMER',
    'ALL_STAR',
    'SOLID',
    'BENCH',
    'BUST',
  ],
) {
  let history = {};

  for (const position of POSITIONS) {
    history = recordFinalBoard(history, position, playersForTiers(position, tiers));
  }

  return completeFinalBoardHistory(history);
}

it('stores exactly five final boards, one for each position', () => {
  const history = completeHistory();

  expect(Object.keys(history)).toHaveLength(5);
  expect(Object.keys(history)).toEqual([...POSITIONS]);
  expect(Object.values(history).every((board) => board.length === 5)).toBe(true);
});

it('uses only the replacement board after a reroll', () => {
  let history = {};
  const originalBoard = playersForTiers('PG', [
    'ALL_STAR',
    'SOLID',
    'BENCH',
    'BUST',
    'BUST',
  ]);
  const replacementBoard = playersForTiers('PG', [
    'ALL_TIMER',
    'BUST',
    'BUST',
    'BUST',
    'BUST',
  ]);

  history = recordFinalBoard(history, 'PG', originalBoard);
  history = recordFinalBoard(history, 'PG', replacementBoard);

  expect(selectBestAvailablePlayer(completeFinalBoardHistory({
    ...completeHistory(),
    ...history,
  }).PG)).toBe(replacementBoard[0]);
});

it('chooses the highest tier and keeps the leftmost player on ties', () => {
  const board = playersForTiers('PG', [
    'BUST',
    'ALL_STAR',
    'SOLID',
    'ALL_STAR',
    'BENCH',
  ]);

  expect(selectBestAvailablePlayer(board)).toBe(board[1]);
});

it('calculates draft score, Best Available score, and rounded efficiency', () => {
  const draftedLineup = POSITIONS.map((position, index) =>
    playersForTiers(position, [
      'ALL_TIMER',
      'ALL_STAR',
      'SOLID',
      'BENCH',
      'BUST',
    ])[index],
  );
  const comparison = createDraftComparison(
    draftedLineup,
    completeHistory(['ALL_TIMER', 'ALL_TIMER', 'ALL_TIMER', 'ALL_TIMER', 'ALL_TIMER']),
  );

  expect(comparison.draftScore).toBe(15);
  expect(comparison.bestAvailableScore).toBe(25);
  expect(comparison.draftEfficiency).toBe(60);
  expect(calculateDraftEfficiency(18, 21)).toBe(86);
  expect(comparison.projectedRecord).toEqual(
    getProjectedRecord(draftedLineup),
  );
  expect(comparison.bestAvailableRecord).toEqual(
    getProjectedRecord(comparison.bestAvailableLineup),
  );
});

it('selects Best Available by buildRating, then tierValue, then board order', () => {
  const board = playersForTiers('PG', [
    'ALL_STAR',
    'SOLID',
    'BENCH',
    'ALL_STAR',
    'BUST',
  ]).map((player, index) => ({
    ...player,
    buildRating: index === 0 || index === 3 ? 88 : undefined,
  }));
  const best = selectBestAvailablePlayer(board);

  expect(best).toBe(board[0]);
});

it('calculates the team rating from the selected five, separately from Draft Score', () => {
  const lineup = POSITIONS.map((position) =>
    playersForTiers(position, ['ALL_TIMER', 'ALL_STAR', 'SOLID', 'BENCH', 'BUST'])[0],
  );

  expect(getDraftScore(lineup)).toBe(25);
  expect(getTeamRating(lineup)).toBe(96);
});
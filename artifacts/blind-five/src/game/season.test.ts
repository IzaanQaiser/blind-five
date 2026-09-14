import { expect, it } from 'vitest';

import { players } from '@/data/players';
import { POSITIONS, TIERS, type Player, type Tier } from '@/types/player';

import {
  getDraftScore,
  getProjectedRecord,
  getProjectedWins,
  getTeamClassification,
  getTeamRating,
  GAMES_PER_SEASON,
} from './scoring';

function lineupForTiers(tiers: readonly Tier[]): Player[] {
  return POSITIONS.map((position, index) => {
    const player = players.find(
      (candidate) =>
        candidate.position === position && candidate.tier === tiers[index],
    );

    if (!player) {
      throw new Error(`Missing ${tiers[index]} player at ${position}`);
    }

    return player;
  });
}

it('calculates Draft Score from the five drafted tier values', () => {
  const lineup = lineupForTiers(TIERS);

  expect(getDraftScore(lineup)).toBe(15);
});

it('projects the same record every time for the same lineup', () => {
  const bustLineup = lineupForTiers([
    'BUST',
    'BUST',
    'BUST',
    'BUST',
    'BUST',
  ]);
  const allTimerLineup = lineupForTiers([
    'ALL_TIMER',
    'ALL_TIMER',
    'ALL_TIMER',
    'ALL_TIMER',
    'ALL_TIMER',
  ]);

  const firstResult = getProjectedRecord(bustLineup);
  const secondResult = getProjectedRecord(bustLineup);
  const allTimerResult = getProjectedRecord(allTimerLineup);

  expect(firstResult).toEqual(secondResult);
  expect(firstResult).toMatchObject({
    teamRating: 64,
    wins: 23,
    losses: 59,
    classification: 'REBUILD',
    percentile: 0,
  });
  expect(allTimerResult.teamRating).toBe(96);
  expect(allTimerResult.wins).toBe(69);
  expect(allTimerResult.losses).toBe(13);
});

it('uses the requested projected-win curve and clamps its range', () => {
  expect(getProjectedWins(60)).toBe(17);
  expect(getProjectedWins(65)).toBe(25);
  expect(getProjectedWins(70)).toBe(32);
  expect(getProjectedWins(75)).toBe(39);
  expect(getProjectedWins(80)).toBe(46);
  expect(getProjectedWins(85)).toBe(54);
  expect(getProjectedWins(90)).toBe(61);
  expect(getProjectedWins(95)).toBe(68);
  expect(getProjectedWins(-100)).toBe(12);
  expect(getProjectedWins(200)).toBe(72);
});

it('never lowers wins when Team Rating increases', () => {
  const lowerWins = getProjectedWins(70);
  const higherWins = getProjectedWins(85);

  expect(higherWins).toBeGreaterThanOrEqual(lowerWins);
});

it('keeps every projected season at 82 games', () => {
  const result = getProjectedRecord(lineupForTiers(TIERS));

  expect(result.wins + result.losses).toBe(GAMES_PER_SEASON);
  expect(result.wins).toBeGreaterThanOrEqual(12);
  expect(result.wins).toBeLessThanOrEqual(72);
});

it('uses buildRating when it is present without exposing it in the result', () => {
  const lineup = lineupForTiers(TIERS).map((player) => ({
    ...player,
    buildRating: 91,
  }));
  const result = getProjectedRecord(lineup);

  expect(getTeamRating(lineup)).toBe(91);
  expect(result.teamRating).toBe(91);
  expect(result).not.toHaveProperty('buildRating');
});

it('maps wins to the new team classifications', () => {
  expect(getTeamClassification(72)).toBe('HISTORIC');
  expect(getTeamClassification(60)).toBe('TITLE CONTENDER');
  expect(getTeamClassification(50)).toBe('50-WIN TEAM');
  expect(getTeamClassification(42)).toBe('WINNING SEASON');
  expect(getTeamClassification(35)).toBe('PLAY-IN RANGE');
  expect(getTeamClassification(25)).toBe('LOTTERY TEAM');
  expect(getTeamClassification(12)).toBe('REBUILD');
});
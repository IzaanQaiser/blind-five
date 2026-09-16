export const POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'] as const;

export type Position = (typeof POSITIONS)[number];

export const TIERS = [
  'ALL_TIMER',
  'ALL_STAR',
  'SOLID',
  'BENCH',
  'BUST',
] as const;

export type Tier = (typeof TIERS)[number];

export const SOURCE_TIERS = [
  'HALL_OF_FAMER',
  'ALL_STAR',
  'SOLID',
  'BENCH',
  'BUST',
] as const;

export type SourceTier = (typeof SOURCE_TIERS)[number];

export interface Player {
  id: string;
  name: string;
  position: Position;
  tier: Tier;
  sourceTier: SourceTier;
  recommendedDrawWeight: number;
  positiveHint: string;
  negativeHint: string;
  neutralHint: string;
  teamHint: string;
  yearsActive: string;
  scoutHint: string;
  extraHint1: string;
  extraHint2: string;
}

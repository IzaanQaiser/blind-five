import type { MysteryRound } from './round';
import type { Player } from '@/types/player';

export type PowerupId =
  | 'teamCheck'
  | 'timeline'
  | 'scout'
  | 'franchisePlayer';

export type PowerupField = 'teamHint' | 'yearsActive' | 'scoutHint';

export type PowerupReveals = Partial<
  Record<Exclude<PowerupId, 'franchisePlayer'>, Record<string, string>>
>;

export type UsedPowerups = Record<PowerupId, boolean>;

const revealFields: Record<
  Exclude<PowerupId, 'franchisePlayer'>,
  PowerupField
> = {
  teamCheck: 'teamHint',
  timeline: 'yearsActive',
  scout: 'scoutHint',
};

export function createPowerupState(): UsedPowerups {
  return {
    teamCheck: false,
    timeline: false,
    scout: false,
    franchisePlayer: false,
  };
}

export function canUsePowerup(
  powerupId: PowerupId,
  usedPowerups: UsedPowerups,
  selectedOptionId: string | null,
): boolean {
  return selectedOptionId === null && !usedPowerups[powerupId];
}

export function consumePowerup(
  usedPowerups: UsedPowerups,
  powerupId: PowerupId,
): UsedPowerups {
  if (usedPowerups[powerupId]) {
    return usedPowerups;
  }

  return {
    ...usedPowerups,
    [powerupId]: true,
  };
}

export function resolvePowerupValues(
  round: MysteryRound,
  field: PowerupField,
  resolvePlayer: (round: MysteryRound, optionId: string) => Player | undefined,
): Record<string, string> {
  return round.options.reduce<Record<string, string>>((values, option) => {
    const player = resolvePlayer(round, option.optionId);

    if (!player) {
      throw new Error(`Unable to resolve mystery option ${option.optionId}`);
    }

    values[option.optionId] = player[field];
    return values;
  }, {});
}

export function refreshPowerupReveals(
  round: MysteryRound,
  currentReveals: PowerupReveals,
  resolvePlayer: (round: MysteryRound, optionId: string) => Player | undefined,
): PowerupReveals {
  return (Object.keys(revealFields) as Array<
    Exclude<PowerupId, 'franchisePlayer'>
  >).reduce<PowerupReveals>((reveals, powerupId) => {
    if (currentReveals[powerupId]) {
      reveals[powerupId] = resolvePowerupValues(
        round,
        revealFields[powerupId],
        resolvePlayer,
      );
    }

    return reveals;
  }, {});
}
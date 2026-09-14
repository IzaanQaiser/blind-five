import { players } from '@/data/players';
import { POSITIONS, type Player, type Position } from '@/types/player';
import {
  getDraftScore,
  getPlayerBuildRating,
  getProjectedRecord,
  type ProjectedRecord,
} from './scoring';

export type FinalBoardHistory = Partial<
  Record<Position, readonly Player[]>
>;

export type CompleteFinalBoardHistory = Record<
  Position,
  readonly Player[]
>;

export interface DraftComparison {
  draftScore: number;
  bestAvailableScore: number;
  draftEfficiency: number;
  bestAvailableLineup: Player[];
  projectedRecord: ProjectedRecord;
  bestAvailableRecord: ProjectedRecord;
}

export function recordFinalBoard(
  history: FinalBoardHistory,
  position: Position,
  board: readonly Player[],
): FinalBoardHistory {
  if (board.length !== 5) {
    throw new Error(`A final board requires exactly five players for ${position}`);
  }

  return {
    ...history,
    [position]: [...board],
  };
}

export function completeFinalBoardHistory(
  history: FinalBoardHistory,
): CompleteFinalBoardHistory {
  const completeHistory = {} as CompleteFinalBoardHistory;

  for (const position of POSITIONS) {
    const board = history[position];

    if (!board || board.length !== 5) {
      throw new Error(`Missing final five-player board for ${position}`);
    }

    completeHistory[position] = board;
  }

  return completeHistory;
}

export function selectBestAvailablePlayer(
  board: readonly Player[],
): Player {
  if (board.length !== 5) {
    throw new Error('Best Available requires a five-player board');
  }

  return board.reduce((bestPlayer, player) => {
    const playerRating = getPlayerBuildRating(player);
    const bestRating = getPlayerBuildRating(bestPlayer);

    if (playerRating !== bestRating) {
      return playerRating > bestRating ? player : bestPlayer;
    }

    return player.tierValue > bestPlayer.tierValue ? player : bestPlayer;
  });
}

export function getBestAvailableLineup(
  history: CompleteFinalBoardHistory,
  playerDatabase: readonly Player[] = players,
): Player[] {
  return POSITIONS.map((position) =>
    selectBestAvailablePlayer(history[position]),
  );
}

export function calculateDraftEfficiency(
  draftScore: number,
  bestAvailableScore: number,
): number {
  if (bestAvailableScore <= 0) {
    throw new Error('Best Available score must be greater than zero');
  }

  return Math.round((draftScore / bestAvailableScore) * 100);
}

export function compareDraftToBestAvailable(
  draftedLineup: readonly Player[],
  history: CompleteFinalBoardHistory,
  playerDatabase: readonly Player[] = players,
): DraftComparison {
  const bestAvailableLineup = getBestAvailableLineup(history, playerDatabase);
  const draftScore = getDraftScore(draftedLineup);
  const bestAvailableScore = getDraftScore(bestAvailableLineup);

  return {
    draftScore,
    bestAvailableScore,
    draftEfficiency: calculateDraftEfficiency(
      draftScore,
      bestAvailableScore,
    ),
    bestAvailableLineup,
    projectedRecord: getProjectedRecord(draftedLineup, playerDatabase),
    bestAvailableRecord: getProjectedRecord(
      bestAvailableLineup,
      playerDatabase,
    ),
  };
}

export function createDraftComparison(
  draftedLineup: readonly Player[],
  history: FinalBoardHistory,
  playerDatabase: readonly Player[] = players,
): DraftComparison {
  return compareDraftToBestAvailable(
    draftedLineup,
    completeFinalBoardHistory(history),
    playerDatabase,
  );
}
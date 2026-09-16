import type { Player, Position, SourceTier } from '@/types/player';

import playerCsv from '@assets/build_five_-_Sheet1_1789411320234.csv?raw';

const requiredHeaders = [
  'ID',
  'Name',
  'Pos',
  'tier',
  'recommendedDrawWeight',
  'Positive',
  'Negative',
  'Neutral',
  'years active',
  'scout hint',
  'extraHint1',
  'extraHint2',
] as const;

const tierMap: Record<SourceTier, Player['tier']> = {
  HALL_OF_FAMER: 'ALL_TIMER',
  ALL_STAR: 'ALL_STAR',
  SOLID: 'SOLID',
  BENCH: 'BENCH',
  BUST: 'BUST',
};

function parseCsvRows(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let isQuoted = false;
  const input = csv.replace(/^\uFEFF/, '');

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (isQuoted) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          isQuoted = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      isQuoted = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

function requiredValue(
  row: readonly string[],
  headerIndex: Record<string, number>,
  header: string,
  rowNumber: number,
): string {
  const value = row[headerIndex[header]] ?? '';

  if (value.trim() === '') {
    throw new Error(`Missing ${header} at CSV row ${rowNumber}`);
  }

  return value;
}

function numericValue(
  row: readonly string[],
  headerIndex: Record<string, number>,
  header: string,
  rowNumber: number,
): number {
  const value = Number(requiredValue(row, headerIndex, header, rowNumber));

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${header} at CSV row ${rowNumber}`);
  }

  return value;
}

function parsePlayers(csv: string): readonly Player[] {
  const [headerRow, ...dataRows] = parseCsvRows(csv);

  if (!headerRow) {
    throw new Error('Player CSV is empty');
  }

  const headerIndex = Object.fromEntries(
    headerRow.map((header, index) => [header, index]),
  );

  for (const header of requiredHeaders) {
    if (headerIndex[header] === undefined) {
      throw new Error(`Player CSV is missing the ${header} column`);
    }
  }

  return dataRows
    .filter((row) => row.some((value) => value.trim() !== ''))
    .map((row, index) => {
      const rowNumber = index + 2;
      const sourceTier = requiredValue(
        row,
        headerIndex,
        'tier',
        rowNumber,
      ) as SourceTier;
      const position = requiredValue(
        row,
        headerIndex,
        'Pos',
        rowNumber,
      ) as Position;
      const extraHint1 = requiredValue(
        row,
        headerIndex,
        'extraHint1',
        rowNumber,
      );
      if (!(sourceTier in tierMap)) {
        throw new Error(`Invalid tier at CSV row ${rowNumber}`);
      }

      if (!['PG', 'SG', 'SF', 'PF', 'C'].includes(position)) {
        throw new Error(`Invalid position at CSV row ${rowNumber}`);
      }

      return {
        id:
          row[headerIndex.ID]?.trim() ||
          `csv-player-${String(index + 1).padStart(3, '0')}`,
        name: requiredValue(row, headerIndex, 'Name', rowNumber),
        position,
        tier: tierMap[sourceTier],
        sourceTier,
        recommendedDrawWeight: numericValue(
          row,
          headerIndex,
          'recommendedDrawWeight',
          rowNumber,
        ),
        positiveHint: requiredValue(row, headerIndex, 'Positive', rowNumber),
        negativeHint: requiredValue(row, headerIndex, 'Negative', rowNumber),
        neutralHint: requiredValue(row, headerIndex, 'Neutral', rowNumber),
        teamHint: extraHint1,
        yearsActive: requiredValue(row, headerIndex, 'years active', rowNumber),
        scoutHint: requiredValue(row, headerIndex, 'scout hint', rowNumber),
        extraHint1,
        extraHint2: requiredValue(row, headerIndex, 'extraHint2', rowNumber),
      };
    });
}

export const players = parsePlayers(playerCsv);

const ANONYMOUS_PLAYER_ID_KEY = 'blind-five-anonymous-player-id';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  updatedAt: string;
}

interface LeaderboardResponse {
  entries: LeaderboardEntry[];
}

interface LeaderboardSubmissionResponse extends LeaderboardResponse {
  entry: LeaderboardEntry;
}

function createAnonymousPlayerId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const randomValue = Math.floor(Math.random() * 16);
    const value = token === 'x' ? randomValue : (randomValue & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getAnonymousPlayerId(): string {
  try {
    const storedPlayerId = window.localStorage.getItem(ANONYMOUS_PLAYER_ID_KEY);

    if (storedPlayerId) {
      return storedPlayerId;
    }

    const playerId = createAnonymousPlayerId();
    window.localStorage.setItem(ANONYMOUS_PLAYER_ID_KEY, playerId);
    return playerId;
  } catch {
    return createAnonymousPlayerId();
  }
}

async function parseLeaderboardResponse(
  response: Response,
): Promise<LeaderboardResponse> {
  if (!response.ok) {
    throw new Error(`Leaderboard request failed with ${response.status}`);
  }

  const payload = (await response.json()) as LeaderboardResponse;

  if (!Array.isArray(payload.entries)) {
    throw new Error('Leaderboard response is invalid');
  }

  return payload;
}

export async function fetchLeaderboard(
  signal?: AbortSignal,
): Promise<LeaderboardEntry[]> {
  const response = await fetch('/api/leaderboard', {
    headers: { Accept: 'application/json' },
    signal,
  });
  const payload = await parseLeaderboardResponse(response);
  return payload.entries;
}

export async function submitLeaderboardScore(
  playerId: string,
  score: number,
): Promise<LeaderboardSubmissionResponse> {
  const response = await fetch('/api/leaderboard', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ playerId, score }),
  });
  const payload = (await parseLeaderboardResponse(
    response,
  )) as LeaderboardSubmissionResponse;

  if (!payload.entry || typeof payload.entry.displayName !== 'string') {
    throw new Error('Leaderboard submission response is invalid');
  }

  return payload;
}

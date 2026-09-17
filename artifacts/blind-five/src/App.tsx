import { useCallback, useEffect, useRef, useState } from "react";

import {
  applyFranchisePlayer,
  createRound,
  resolveMysteryPlayer,
} from "./game/round";
import {
  canUsePowerup,
  countNewlyUsedPowerups,
  consumePowerup,
  createPowerupState,
  refreshPowerupReveals,
  resolveBoardPlayers,
  resolvePowerupValues,
  type PowerupField,
  type PowerupId,
  type PowerupRevealId,
  type PowerupReveals,
} from "./game/powerups";
import {
  calculateFinalScore,
  calculatePickScore,
  formatScore,
  getNextPersonalBest,
  getPowerupMultiplier,
  normalizeScore,
  PLAYER_TIER_POINTS,
  POWERUP_MULTIPLIERS,
  selectBestScoringPlayer,
  type PickScoreBreakdown,
} from "./game/scoring";
import {
  fetchLeaderboard,
  getAnonymousPlayerId,
  submitLeaderboardScore,
  type LeaderboardEntry,
} from "./game/leaderboard";
import { POSITIONS, type Player, type Position } from "./types/player";

type PowerupDefinition = {
  id: PowerupId;
  label: string;
  description: string;
  shortcut: string;
  field?: PowerupField;
};

type RevealPowerupDefinition = Omit<PowerupDefinition, "id" | "field"> & {
  id: PowerupRevealId;
  field: PowerupField;
};

const powerupDefinitions: PowerupDefinition[] = [
  {
    id: "teamCheck",
    label: "EXTRA HINT",
    description: "Reveals an extra hint for each player.",
    shortcut: "1",
    field: "teamHint",
  },
  {
    id: "timeline",
    label: "TIMELINE",
    description: "Reveals years active for each player.",
    shortcut: "2",
    field: "yearsActive",
  },
  {
    id: "revealBoard",
    label: "REVEAL BOARD",
    description: "Reveals every player and tier on the current board.",
    shortcut: "3",
  },
  {
    id: "franchisePlayer",
    label: "FRANCHISE PLAYER",
    description:
      "Shuffles the board to guarantee at least one all-timer on the board.",
    shortcut: "4",
  },
];

const scoringExample = calculatePickScore("ALL_TIMER", 2);

const positionDetails: Record<Position, string> = {
  PG: "CHOOSE YOUR POINT GUARD",
  SG: "CHOOSE YOUR SHOOTING GUARD",
  SF: "CHOOSE YOUR SMALL FORWARD",
  PF: "CHOOSE YOUR POWER FORWARD",
  C: "CHOOSE YOUR CENTER",
};

const PERSONAL_BEST_STORAGE_KEY = "blind-five-personal-best";

function formatTier(tier: Player["tier"]) {
  return tier.replace("_", " ");
}

function ScoringExample() {
  return (
    <div className="help-score-example">
      <div>
        <span>EXAMPLE PICK</span>
        <strong>HALL OF FAMER / ALL-TIMER</strong>
      </div>
      <div className="help-score-example-equation">
        <span>{formatScore(scoringExample.basePoints)}</span>
        <em>×</em>
        <span>{scoringExample.multiplier.toFixed(2)}</span>
        <em>=</em>
        <strong>+{formatScore(scoringExample.score)}</strong>
      </div>
      <small>2 POWERUPS USED</small>
    </div>
  );
}

type LeaderboardBoardProps = {
  entries: LeaderboardEntry[];
  anonymousPlayerId: string;
  isLoading: boolean;
  error: string | null;
  columns?: boolean;
};

function LeaderboardBoard({
  entries,
  anonymousPlayerId,
  isLoading,
  error,
  columns = false,
}: LeaderboardBoardProps) {
  const entryGroups =
    columns && entries.length > 5
      ? [entries.slice(0, 5), entries.slice(5)]
      : [entries];

  return (
    <>
      {error ? (
        <p className="leaderboard-message is-error" role="status">
          {error}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <div
          className={`leaderboard-lists ${
            entryGroups.length > 1 ? "is-split" : ""
          }`}
        >
          {entryGroups.map((group) => (
            <ol className="leaderboard-list" key={group[0]?.rank ?? 0}>
              {group.map((entry) => (
                <li
                  className={
                    entry.playerId === anonymousPlayerId ? "is-you" : ""
                  }
                  key={entry.playerId}
                >
                  <span className="leaderboard-rank">
                    {String(entry.rank).padStart(2, "0")}
                  </span>
                  <strong>{entry.displayName}</strong>
                  <span className="leaderboard-score">
                    {formatScore(entry.score)}
                  </span>
                </li>
              ))}
            </ol>
          ))}
        </div>
      ) : (
        <p className="leaderboard-message" role="status">
          {isLoading
            ? "LOADING SCORES…"
            : "NO SCORES YET — FINISH A DRAFT TO TAKE THE TOP SPOT."}
        </p>
      )}

      <div className="leaderboard-live-note">
        <span className="status-dot" aria-hidden="true" />
        <span>LIVE · REFRESHES EVERY 10 SECONDS</span>
      </div>
    </>
  );
}

function formatRunningPenalty(
  multiplier: number,
  rawScore: number,
  totalScore: number,
) {
  if (rawScore === 0) {
    return multiplier.toFixed(2);
  }

  for (let decimals = 2; decimals <= 4; decimals += 1) {
    const displayedMultiplier = Number(multiplier.toFixed(decimals));
    if (
      formatScore(rawScore * displayedMultiplier) === formatScore(totalScore)
    ) {
      return multiplier.toFixed(decimals);
    }
  }

  return multiplier.toFixed(4);
}

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, select, textarea, [contenteditable="true"]'))
  );
}

function getInitialHowToPlayOpen() {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return (
      window.localStorage.getItem("blind-five-how-to-play-seen") !== "true"
    );
  } catch {
    return false;
  }
}

function persistHowToPlayDismissal() {
  try {
    window.localStorage.setItem("blind-five-how-to-play-seen", "true");
  } catch {
    // If storage is unavailable, the current session can still continue.
  }
}

function getInitialPersonalBest(): number | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storedValue = window.localStorage.getItem(PERSONAL_BEST_STORAGE_KEY);

    if (storedValue === null) {
      return null;
    }

    const parsedValue = Number(storedValue);
    return Number.isFinite(parsedValue) ? normalizeScore(parsedValue) : null;
  } catch {
    return null;
  }
}

function persistPersonalBest(score: number) {
  try {
    window.localStorage.setItem(
      PERSONAL_BEST_STORAGE_KEY,
      String(normalizeScore(score)),
    );
  } catch {
    // The completed score still works when storage is unavailable.
  }
}

function App() {
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [round, setRound] = useState(() => createRound(POSITIONS[0]));
  const [lineup, setLineup] = useState<Partial<Record<Position, Player>>>({});
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [revealedPlayers, setRevealedPlayers] = useState<Record<
    string,
    Player
  > | null>(null);
  const [usedPowerups, setUsedPowerups] = useState(createPowerupState);
  const [boardStartPowerups, setBoardStartPowerups] =
    useState(createPowerupState);
  const [currentPowerupReveals, setCurrentPowerupReveals] =
    useState<PowerupReveals>({});
  const [isDraftComplete, setIsDraftComplete] = useState(false);
  const [pickScores, setPickScores] = useState<
    Partial<Record<Position, PickScoreBreakdown>>
  >({});
  const [bestPossibleLineup, setBestPossibleLineup] = useState<
    Partial<Record<Position, Player>>
  >({});
  const [personalBest, setPersonalBest] = useState(getInitialPersonalBest);
  const [isNewPersonalBest, setIsNewPersonalBest] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<
    LeaderboardEntry[]
  >([]);
  const [leaderboardPlayerName, setLeaderboardPlayerName] = useState<
    string | null
  >(null);
  const [isLeaderboardLoading, setIsLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [anonymousPlayerId] = useState(getAnonymousPlayerId);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(
    getInitialHowToPlayOpen,
  );
  const modalRef = useRef<HTMLElement>(null);
  const completionLeaderboardRef = useRef<HTMLElement>(null);

  const currentPosition = POSITIONS[currentPositionIndex];
  const currentBoardPowerupsUsed = countNewlyUsedPowerups(
    usedPowerups,
    boardStartPowerups,
  );
  const currentPickScore = pickScores[currentPosition];
  const liveScore = calculateFinalScore(Object.values(pickScores));
  const rawScore = Object.values(pickScores).reduce(
    (total, pickScore) => total + pickScore.basePoints,
    0,
  );
  const runningPowerupPenalty =
    rawScore === 0
      ? getPowerupMultiplier(currentBoardPowerupsUsed)
      : liveScore / rawScore;
  const runningPowerupPenaltyLabel = formatRunningPenalty(
    runningPowerupPenalty,
    rawScore,
    liveScore,
  );
  const bestPossibleScore = calculateFinalScore(
    POSITIONS.flatMap((position) => {
      const player = bestPossibleLineup[position];
      const pickScore = pickScores[position];

      return player && pickScore
        ? [calculatePickScore(player.tier, pickScore.powerupsUsed)]
        : [];
    }),
  );
  const revealedPowerups = powerupDefinitions.filter(
    (powerup): powerup is RevealPowerupDefinition => {
      if (powerup.id !== "teamCheck" && powerup.id !== "timeline") {
        return false;
      }

      return Boolean(currentPowerupReveals[powerup.id]);
    },
  );

  const loadLeaderboard = useCallback(
    async (signal?: AbortSignal) => {
      setIsLeaderboardLoading(true);

      try {
        const entries = await fetchLeaderboard(signal);
        setLeaderboardEntries(entries);
        setLeaderboardError(null);

        const playerEntry = entries.find(
          (entry) => entry.playerId === anonymousPlayerId,
        );
        if (playerEntry) {
          setLeaderboardPlayerName(playerEntry.displayName);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLeaderboardError("Leaderboard is temporarily unavailable.");
      } finally {
        setIsLeaderboardLoading(false);
      }
    },
    [anonymousPlayerId],
  );

  const showLeaderboard = useCallback(() => {
    setIsHelpOpen(false);

    if (isDraftComplete) {
      setIsLeaderboardOpen(false);
      window.requestAnimationFrame(() => {
        completionLeaderboardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
      return;
    }

    setIsLeaderboardOpen(true);
  }, [isDraftComplete]);

  const handlePick = (optionId: string) => {
    if (selectedOptionId !== null) {
      return;
    }

    const selectedPlayer = resolveMysteryPlayer(round, optionId);

    if (!selectedPlayer) {
      throw new Error(`Unable to resolve mystery option ${optionId}`);
    }

    const playersByOption = resolveBoardPlayers(round, resolveMysteryPlayer);

    setSelectedOptionId(optionId);
    setRevealedPlayers(playersByOption);
    setBestPossibleLineup((currentLineup) => ({
      ...currentLineup,
      [currentPosition]: selectBestScoringPlayer(
        Object.values(playersByOption),
      ),
    }));
    setLineup((currentLineup) => ({
      ...currentLineup,
      [currentPosition]: selectedPlayer,
    }));
    setPickScores((currentScores) => ({
      ...currentScores,
      [currentPosition]: calculatePickScore(
        selectedPlayer.tier,
        currentBoardPowerupsUsed,
      ),
    }));
  };

  const handleUsePowerup = (powerupId: PowerupId) => {
    if (
      isDraftComplete ||
      !canUsePowerup(powerupId, usedPowerups, selectedOptionId)
    ) {
      return;
    }

    const powerup = powerupDefinitions.find(({ id }) => id === powerupId);

    if (!powerup) {
      throw new Error(`Unknown powerup ${powerupId}`);
    }

    if (powerupId === "franchisePlayer") {
      const nextRound = applyFranchisePlayer(round);
      setRound(nextRound);
      setRevealedPlayers(
        usedPowerups.revealBoard
          ? resolveBoardPlayers(nextRound, resolveMysteryPlayer)
          : null,
      );
      setUsedPowerups((currentState) =>
        consumePowerup(currentState, powerupId),
      );
      setCurrentPowerupReveals((currentReveals) =>
        refreshPowerupReveals(nextRound, currentReveals, resolveMysteryPlayer),
      );
      return;
    }

    if (powerupId === "revealBoard") {
      setRevealedPlayers(resolveBoardPlayers(round, resolveMysteryPlayer));
      setUsedPowerups((currentState) =>
        consumePowerup(currentState, powerupId),
      );
      return;
    }

    if (!powerup.field) {
      throw new Error(`Powerup ${powerupId} is missing a reveal field`);
    }

    const valuesByOption = resolvePowerupValues(
      round,
      powerup.field,
      resolveMysteryPlayer,
    );

    setUsedPowerups((currentState) => consumePowerup(currentState, powerupId));
    setCurrentPowerupReveals((currentReveals) => ({
      ...currentReveals,
      [powerupId]: valuesByOption,
    }));
  };

  const handleContinue = () => {
    if (
      isDraftComplete ||
      selectedOptionId === null ||
      revealedPlayers === null
    ) {
      return;
    }

    if (currentPositionIndex === POSITIONS.length - 1) {
      const completedPickScores = POSITIONS.map((position) => {
        const score = pickScores[position];

        if (!score) {
          throw new Error(`Missing pick score for position ${position}`);
        }

        return score;
      });
      const completedScore = calculateFinalScore(completedPickScores);
      const nextPersonalBest = getNextPersonalBest(
        personalBest,
        completedScore,
      );

      setIsNewPersonalBest(
        personalBest === null || completedScore > personalBest,
      );
      setPersonalBest(nextPersonalBest);
      persistPersonalBest(nextPersonalBest);
      setIsDraftComplete(true);
      void submitLeaderboardScore(anonymousPlayerId, completedScore)
        .then(({ entry, entries }) => {
          setLeaderboardPlayerName(entry.displayName);
          setLeaderboardEntries(entries);
          setLeaderboardError(null);
        })
        .catch(() => {
          setLeaderboardError("Your score could not be added right now.");
        });
      return;
    }

    const nextPositionIndex = currentPositionIndex + 1;
    setBoardStartPowerups(usedPowerups);
    setCurrentPositionIndex(nextPositionIndex);
    setRound(createRound(POSITIONS[nextPositionIndex]));
    setSelectedOptionId(null);
    setRevealedPlayers(null);
    setCurrentPowerupReveals({});
  };

  const handleRestart = () => {
    setCurrentPositionIndex(0);
    setRound(createRound(POSITIONS[0]));
    setLineup({});
    setSelectedOptionId(null);
    setRevealedPlayers(null);
    setUsedPowerups(createPowerupState());
    setBoardStartPowerups(createPowerupState());
    setCurrentPowerupReveals({});
    setIsDraftComplete(false);
    setPickScores({});
    setBestPossibleLineup({});
    setIsNewPersonalBest(false);
  };

  const closeHowToPlay = () => {
    persistHowToPlayDismissal();
    setIsHowToPlayOpen(false);
  };

  useEffect(() => {
    if (!isHelpOpen && !isHowToPlayOpen && !isLeaderboardOpen) {
      return;
    }

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const modal = modalRef.current;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusable = modal
      ? Array.from(modal.querySelectorAll<HTMLElement>(focusableSelector))
      : [];

    focusable[0]?.focus();

    const handleModalTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || focusable.length === 0) {
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleModalTab);
    return () => {
      document.removeEventListener("keydown", handleModalTab);
      previouslyFocused?.focus();
    };
  }, [isHelpOpen, isHowToPlayOpen, isLeaderboardOpen]);

  useEffect(() => {
    if (!isLeaderboardOpen && !isDraftComplete) {
      return;
    }

    const controller = new AbortController();
    void loadLeaderboard(controller.signal);
    const refreshTimer = window.setInterval(() => {
      void loadLeaderboard(controller.signal);
    }, 10_000);

    return () => {
      controller.abort();
      window.clearInterval(refreshTimer);
    };
  }, [isDraftComplete, isLeaderboardOpen, loadLeaderboard]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "Escape") {
        if (isHowToPlayOpen) {
          event.preventDefault();
          closeHowToPlay();
        } else if (isHelpOpen) {
          event.preventDefault();
          setIsHelpOpen(false);
        } else if (isLeaderboardOpen) {
          event.preventDefault();
          setIsLeaderboardOpen(false);
        }
        return;
      }

      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key === "?" || event.key.toLowerCase() === "h") {
        event.preventDefault();
        if (!isHowToPlayOpen) {
          setIsLeaderboardOpen(false);
          setIsHelpOpen(true);
        }
        return;
      }

      if (event.key.toLowerCase() === "l") {
        event.preventDefault();
        if (!isHowToPlayOpen) {
          showLeaderboard();
        }
        return;
      }

      if (isHelpOpen || isHowToPlayOpen || isLeaderboardOpen) {
        return;
      }

      const shortcutPowerups: Record<string, PowerupId> = {
        "1": "teamCheck",
        "2": "timeline",
        "3": "revealBoard",
        "4": "franchisePlayer",
      };
      const powerupId = shortcutPowerups[event.key];

      if (powerupId) {
        if (
          isDraftComplete ||
          !canUsePowerup(powerupId, usedPowerups, selectedOptionId)
        ) {
          return;
        }

        event.preventDefault();
        handleUsePowerup(powerupId);
        return;
      }

      if (
        event.key.toLowerCase() === "n" &&
        selectedOptionId !== null &&
        !isDraftComplete
      ) {
        event.preventDefault();
        handleContinue();
        return;
      }

      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        handleRestart();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentPowerupReveals,
    isDraftComplete,
    isHelpOpen,
    isHowToPlayOpen,
    isLeaderboardOpen,
    round,
    selectedOptionId,
    showLeaderboard,
    usedPowerups,
  ]);

  return (
    <main
      className={`game-shell ${isDraftComplete ? "is-complete" : "is-drafting"}`}
      data-testid="page-blind-five"
    >
      <div className="court-lines" aria-hidden="true" />

      <header className="topbar" data-testid="header-game">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            BF
          </span>
          <span className="brand-name">BLIND FIVE</span>
        </div>
        <div className="topbar-center-actions">
          <button
            className="topbar-restart-button"
            type="button"
            onClick={handleRestart}
            aria-label="Restart draft. Keyboard shortcut R"
          >
            <kbd className="control-keycap">R</kbd>
            <span>RESTART DRAFT</span>
          </button>
          <button
            className="topbar-restart-button topbar-help-button"
            type="button"
            onClick={() => {
              setIsLeaderboardOpen(false);
              setIsHelpOpen(true);
            }}
            aria-label="Open help. Keyboard shortcut H"
          >
            <kbd className="control-keycap">H</kbd>
            <span>HELP</span>
          </button>
          <button
            className="topbar-restart-button topbar-leaderboard-button"
            type="button"
            onClick={showLeaderboard}
            aria-label={
              isDraftComplete
                ? "Jump to leaderboard. Keyboard shortcut L"
                : "Open leaderboard. Keyboard shortcut L"
            }
          >
            <kbd className="control-keycap">L</kbd>
            <span>LEADERBOARD</span>
          </button>
        </div>
        <div className="topbar-actions">
          <div className="live-score" data-testid="live-score">
            <div className="score-equation-value">
              <span>RAW SCORE</span>
              <strong>{rawScore.toFixed(2)}</strong>
            </div>
            <em className="score-equation-operator">×</em>
            <div className="score-equation-value score-equation-penalty">
              <span>PENALTY</span>
              <strong key={`${liveScore}-${currentBoardPowerupsUsed}`}>
                {runningPowerupPenaltyLabel}
              </strong>
            </div>
            <em className="score-equation-operator">=</em>
            <div className="score-equation-value score-equation-total">
              <span>TOTAL SCORE</span>
              <strong>{formatScore(liveScore)}</strong>
            </div>
          </div>
          <div
            className={`game-status ${isDraftComplete ? "is-complete" : ""}`}
            data-testid="status-game"
          >
            <span className="status-dot" aria-hidden="true" />
            <span>{isDraftComplete ? "FINAL WHISTLE" : "PRE-GAME"}</span>
          </div>
        </div>
      </header>

      <section
        className="game-content"
        aria-label={
          isDraftComplete ? "Blind Five final results" : "Blind Five draft"
        }
      >
        {!isDraftComplete ? (
          <>
            <div className="eyebrow-row">
              <span className="eyebrow-rule" aria-hidden="true" />
              <p className="eyebrow">STARTING FIVE</p>
              <span className="eyebrow-rule" aria-hidden="true" />
            </div>
            <div className="active-draft-heading">
              <div className="current-position" data-testid="current-position">
                <span className="current-position-label">ON THE CLOCK</span>
                <span className="current-position-value">
                  {currentPosition}
                </span>
              </div>
              <span className="active-draft-count">
                {currentPositionIndex + 1} / {POSITIONS.length} POSITIONS
              </span>
            </div>
          </>
        ) : null}

        {!isDraftComplete ? (
          <nav
            className="position-progress"
            aria-label="Lineup position progress"
            data-testid="progress-positions"
          >
            {POSITIONS.map((position, index) => (
              <div
                className={`position-step ${
                  index < currentPositionIndex
                    ? "is-completed"
                    : index === currentPositionIndex
                      ? "is-active"
                      : "is-upcoming"
                }`}
                key={position}
                data-testid={`progress-position-${position.toLowerCase()}`}
                aria-current={
                  index === currentPositionIndex ? "step" : undefined
                }
              >
                <span className="position-index">0{index + 1}</span>
                <span className="position-code">{position}</span>
                <span className="position-name">
                  {lineup[position]?.name ??
                    (index === currentPositionIndex
                      ? "ON THE CLOCK"
                      : "UP NEXT")}
                </span>
                <span className="position-tick" aria-hidden="true" />
              </div>
            ))}
          </nav>
        ) : null}

        {isDraftComplete ? (
          <section
            className="draft-complete-panel"
            aria-labelledby="draft-complete-heading"
            data-testid="final-results"
          >
            <div className="final-score-hero">
              <div className="final-score-primary">
                <span className="round-kicker">FINAL SCORE</span>
                <div className="final-score" data-testid="final-score">
                  {formatScore(liveScore)}
                </div>
              </div>
              <div className="final-score-summary">
                {isNewPersonalBest ? (
                  <strong className="new-best" data-testid="new-best">
                    NEW BEST
                  </strong>
                ) : (
                  <span className="score-complete-label">DRAFT COMPLETE</span>
                )}
                <p className="personal-best" data-testid="personal-best">
                  PERSONAL BEST{" "}
                  <strong>{formatScore(personalBest ?? liveScore)}</strong>
                </p>
              </div>
            </div>

            <div className="completion-header">
              <div>
                <span className="round-kicker">DRAFTED LINEUP</span>
                <h2 id="draft-complete-heading">YOUR STARTING FIVE</h2>
              </div>
              <span className="round-count">05 PICKS</span>
            </div>

            <div className="lineup-grid">
              {POSITIONS.map((position, index) => {
                const player = lineup[position];
                const pickScore = pickScores[position];

                if (!player || !pickScore) {
                  throw new Error(
                    `Missing final result for position ${position}`,
                  );
                }

                return (
                  <article className="lineup-slot" key={position}>
                    <span className="lineup-position">
                      0{index + 1} / {position}
                    </span>
                    <strong>{player.name}</strong>
                    <div className="lineup-result-meta">
                      <span className="lineup-tier">
                        {formatTier(player.tier)}
                      </span>
                      <strong className="lineup-contribution">
                        +{formatScore(pickScore.score)}
                      </strong>
                    </div>
                    <span className="lineup-powerup-cost">
                      {pickScore.powerupsUsed === 0
                        ? "NO POWERUPS"
                        : `${pickScore.powerupsUsed} POWERUP${
                            pickScore.powerupsUsed === 1 ? "" : "S"
                          }`}
                    </span>
                  </article>
                );
              })}
            </div>

            <div className="completion-header best-possible-header">
              <div>
                <span className="round-kicker">YOUR BOARD CEILING</span>
                <h2>BEST POSSIBLE LINEUP</h2>
              </div>
              <span className="best-possible-score">
                {formatScore(bestPossibleScore)} POINTS
              </span>
            </div>

            <div
              className="lineup-grid best-possible-grid"
              data-testid="best-possible-lineup"
            >
              {POSITIONS.map((position, index) => {
                const player = bestPossibleLineup[position];
                const pickScore = pickScores[position];

                if (!player || !pickScore) {
                  throw new Error(
                    `Missing best possible result for position ${position}`,
                  );
                }

                const contribution = calculatePickScore(
                  player.tier,
                  pickScore.powerupsUsed,
                );

                return (
                  <article
                    className="lineup-slot best-possible-slot"
                    key={position}
                  >
                    <span className="lineup-position">
                      0{index + 1} / {position}
                    </span>
                    <strong>{player.name}</strong>
                    <div className="lineup-result-meta">
                      <span className="lineup-tier">
                        {formatTier(player.tier)}
                      </span>
                      <strong className="lineup-contribution">
                        +{formatScore(contribution.score)}
                      </strong>
                    </div>
                    <span className="lineup-powerup-cost">
                      BEST ON YOUR {position} BOARD
                    </span>
                  </article>
                );
              })}
            </div>

            <section
              className="completion-leaderboard"
              aria-labelledby="completion-leaderboard-title"
              ref={completionLeaderboardRef}
            >
              <div className="completion-leaderboard-header">
                <div>
                  <span className="round-kicker">LIVE / TOP 10</span>
                  <h2 id="completion-leaderboard-title">LEADERBOARD</h2>
                </div>
                <div className="leaderboard-identity">
                  <span>YOU</span>
                  <strong>
                    {leaderboardPlayerName ?? "ASSIGNING PLAYER NAME…"}
                  </strong>
                </div>
              </div>
              <LeaderboardBoard
                entries={leaderboardEntries}
                anonymousPlayerId={anonymousPlayerId}
                isLoading={isLeaderboardLoading}
                error={leaderboardError}
                columns
              />
            </section>

            <button
              className="restart-button"
              type="button"
              onClick={handleRestart}
              data-testid="draft-again"
            >
              <span>Draft Again</span>
              <kbd className="control-keycap">R</kbd>
            </button>
          </section>
        ) : (
          <>
            <section
              className="powerups"
              aria-label="Scouting powerups"
              data-testid="powerups"
            >
              <div className="powerups-header">
                <div>
                  <span className="round-kicker">SCOUTING TOOLS</span>
                  <div className="powerups-title-row">
                    <h2>POWERUPS</h2>
                    <button
                      className="help-button powerups-help-button"
                      type="button"
                      onClick={() => setIsHelpOpen(true)}
                      aria-label="Explain powerups and keyboard shortcuts"
                      title="Explain powerups"
                    >
                      <kbd className="control-keycap">?</kbd>
                    </button>
                  </div>
                </div>
              </div>

              <div className="powerup-grid">
                {powerupDefinitions.map((powerup) => {
                  const isUsed = usedPowerups[powerup.id];
                  const isLockedAfterPick =
                    selectedOptionId !== null && !isUsed;

                  return (
                    <button
                      className={`powerup-button ${
                        isUsed || isLockedAfterPick ? "is-used" : ""
                      }`}
                      type="button"
                      disabled={isUsed || isLockedAfterPick}
                      key={powerup.id}
                      onClick={() => handleUsePowerup(powerup.id)}
                      data-testid={`powerup-${powerup.id}`}
                    >
                      <span className="powerup-label-row">
                        <span className="powerup-label">{powerup.label}</span>
                        <kbd className="control-keycap">{powerup.shortcut}</kbd>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section
              className="mystery-round"
              aria-label={`${currentPosition} mystery round`}
              data-testid="mystery-round"
            >
              <div
                className="round-corner round-corner-tl"
                aria-hidden="true"
              />
              <div
                className="round-corner round-corner-tr"
                aria-hidden="true"
              />
              <div
                className="round-corner round-corner-bl"
                aria-hidden="true"
              />
              <div
                className="round-corner round-corner-br"
                aria-hidden="true"
              />

              <div className="round-header">
                <div>
                  <span className="round-kicker">
                    {currentPosition} / MYSTERY ROUND
                  </span>
                  <h2>{positionDetails[currentPosition]}</h2>
                </div>
                {selectedOptionId !== null ? (
                  <div className="round-header-selection">
                    <p
                      className="selection-feedback"
                      role="status"
                      data-testid="status-selection"
                    >
                      <span>
                        {lineup[currentPosition]?.name} selected for{" "}
                        {currentPosition}
                      </span>
                      <strong>TOTAL {formatScore(liveScore)}</strong>
                    </p>
                    <button
                      className="continue-button"
                      type="button"
                      onClick={handleContinue}
                      data-testid="continue-draft"
                    >
                      <span>
                        {currentPositionIndex === POSITIONS.length - 1
                          ? "Finish Draft"
                          : "Next"}
                      </span>
                      <kbd className="control-keycap">N</kbd>
                    </button>
                  </div>
                ) : (
                  <span className="round-count">05 OPTIONS</span>
                )}
              </div>

              <div className="mystery-card-grid">
                {round.options.map((option, index) => (
                  <article
                    className={`mystery-card ${
                      selectedOptionId === option.optionId
                        ? "is-selected"
                        : selectedOptionId !== null
                          ? "is-locked"
                          : ""
                    } ${
                      revealedPlayers?.[option.optionId]
                        ? `is-revealed tier-${revealedPlayers[
                            option.optionId
                          ].tier
                            .toLowerCase()
                            .replace("_", "-")}`
                        : ""
                    }`}
                    data-testid="mystery-card"
                    key={option.optionId}
                    aria-label={
                      revealedPlayers?.[option.optionId]
                        ? `${revealedPlayers[option.optionId].name}, ${formatTier(revealedPlayers[option.optionId].tier)}`
                        : "Mystery player"
                    }
                  >
                    <div className="card-topline">
                      <span>
                        {selectedOptionId === option.optionId
                          ? "SELECTED"
                          : selectedOptionId !== null
                            ? "LOCKED"
                            : revealedPlayers?.[option.optionId]
                              ? "REVEALED"
                              : `OPTION 0${index + 1}`}
                      </span>
                      <span aria-hidden="true">
                        {selectedOptionId === option.optionId
                          ? "SELECTED"
                          : selectedOptionId !== null
                            ? "NOT PICKED"
                            : revealedPlayers?.[option.optionId]
                              ? "VISIBLE"
                              : "OPEN"}
                      </span>
                    </div>

                    <div
                      className="card-reveal card-reveal-header"
                      aria-live="polite"
                    >
                      {revealedPlayers?.[option.optionId] ? (
                        <>
                          <strong>
                            {revealedPlayers[option.optionId].name}
                          </strong>
                          <span>
                            {formatTier(revealedPlayers[option.optionId].tier)}
                          </span>
                        </>
                      ) : (
                        <>
                          <strong
                            className="card-reveal-placeholder"
                            aria-hidden="true"
                          >
                            — — —
                          </strong>
                          <span
                            className="card-tier-placeholder"
                            aria-hidden="true"
                          >
                            — —
                          </span>
                        </>
                      )}
                    </div>

                    <div className="card-clues">
                      {option.hints.map((hint, hintIndex) => (
                        <p
                          className="card-clue"
                          key={`${option.optionId}-hint-${hintIndex}`}
                        >
                          <span>{hint}</span>
                        </p>
                      ))}
                    </div>

                    {revealedPowerups.length > 0 ? (
                      <div className="card-powerup-hints">
                        {revealedPowerups.map((powerup) => (
                          <p
                            className="card-powerup-hint"
                            key={`${option.optionId}-${powerup.id}`}
                          >
                            <span>{powerup.label}</span>
                            <strong>
                              {
                                currentPowerupReveals[powerup.id]?.[
                                  option.optionId
                                ]
                              }
                            </strong>
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {selectedOptionId === option.optionId &&
                    currentPickScore ? (
                      <div
                        className="card-pick-score"
                        data-testid="current-pick-score"
                      >
                        {currentPickScore.powerupsUsed > 0 ? (
                          <span>
                            {formatScore(currentPickScore.basePoints)} ×{" "}
                            {currentPickScore.multiplier.toFixed(2)}
                          </span>
                        ) : (
                          <span>NO POWERUP PENALTY</span>
                        )}
                        <strong>+{formatScore(currentPickScore.score)}</strong>
                      </div>
                    ) : (
                      <button
                        className="pick-button"
                        type="button"
                        disabled={selectedOptionId !== null}
                        onClick={() => handlePick(option.optionId)}
                        data-testid={`pick-option-${option.optionId}`}
                      >
                        Pick
                      </button>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        )}

        <div className="bottom-note" data-testid="text-game-hint">
          <span className="bottom-note-line" aria-hidden="true" />
          <span>THE LINEUP IS WAITING</span>
          <span className="bottom-note-line" aria-hidden="true" />
        </div>
      </section>

      <footer className="game-footer">
        <span>BF / 001</span>
        <span>BUILD YOUR FIVE</span>
        <span>READY</span>
      </footer>

      {isHelpOpen ? (
        <div
          className="help-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsHelpOpen(false);
            }
          }}
        >
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            ref={modalRef}
          >
            <div className="help-modal-header">
              <div>
                <span className="round-kicker">QUICK REFERENCE</span>
                <h2 id="help-modal-title">SCORING &amp; POWERUPS</h2>
              </div>
              <button
                className="help-close-button"
                type="button"
                onClick={() => setIsHelpOpen(false)}
                aria-label="Close help"
              >
                ×
              </button>
            </div>
            <p className="help-modal-intro">
              Build the best five you can. Powerups make each decision safer,
              but lower the scoring ceiling for that pick.
            </p>
            <section className="help-scoring" aria-labelledby="scoring-title">
              <div className="help-section-heading">
                <h3 id="scoring-title">SCORING</h3>
                <strong>MAX 100.0</strong>
              </div>
              <div className="help-score-columns">
                <div>
                  <span className="help-score-label">PLAYER VALUE</span>
                  {(
                    ["ALL_TIMER", "ALL_STAR", "SOLID", "BENCH", "BUST"] as const
                  ).map((tier) => (
                    <p key={tier}>
                      <span>{formatTier(tier)}</span>
                      <strong>{PLAYER_TIER_POINTS[tier]}</strong>
                    </p>
                  ))}
                </div>
                <div>
                  <span className="help-score-label">POWERUP MULTIPLIER</span>
                  {([0, 1, 2, 3, 4] as const).map((count) => (
                    <p key={count}>
                      <span>
                        {count} POWERUP{count === 1 ? "" : "S"}
                      </span>
                      <strong>
                        {Math.round(POWERUP_MULTIPLIERS[count] * 100)}%
                      </strong>
                    </p>
                  ))}
                </div>
              </div>
              <ScoringExample />
              <p className="help-perfect-score">
                A perfect 100.0 requires five All-Timers without using a single
                powerup. Each powerup can be used once per draft.
              </p>
            </section>
            <div className="help-powerup-list">
              {powerupDefinitions.map((powerup) => (
                <div className="help-powerup-row" key={powerup.id}>
                  <div className="help-powerup-heading">
                    <strong>{powerup.label}</strong>
                    <kbd className="control-keycap">{powerup.shortcut}</kbd>
                  </div>
                  <p>{powerup.description}</p>
                </div>
              ))}
            </div>
            <div className="help-shortcuts">
              <span>
                <kbd className="control-keycap">N</kbd> Next Pick
              </span>
              <span>
                <kbd className="control-keycap">R</kbd> Restart / Draft Again
              </span>
              <span>
                <kbd className="control-keycap">H</kbd> Open Help
              </span>
              <span>
                <kbd className="control-keycap">L</kbd> Leaderboard
              </span>
            </div>
            <button
              className="help-reopen-button"
              type="button"
              onClick={() => setIsHelpOpen(false)}
            >
              BACK TO THE GAME
            </button>
          </section>
        </div>
      ) : null}

      {isLeaderboardOpen ? (
        <div
          className="help-modal-backdrop leaderboard-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              setIsLeaderboardOpen(false);
            }
          }}
        >
          <section
            className="help-modal leaderboard-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leaderboard-title"
            ref={modalRef}
          >
            <div className="help-modal-header">
              <div>
                <span className="round-kicker">LIVE / TOP 10</span>
                <h2 id="leaderboard-title">LEADERBOARD</h2>
              </div>
              <button
                className="help-close-button"
                type="button"
                onClick={() => setIsLeaderboardOpen(false)}
                aria-label="Close leaderboard"
              >
                ×
              </button>
            </div>

            <div className="leaderboard-identity">
              <span>YOUR ANONYMOUS NAME</span>
              <strong>
                {leaderboardPlayerName ?? "ASSIGNED AFTER YOUR FIRST DRAFT"}
              </strong>
            </div>

            <LeaderboardBoard
              entries={leaderboardEntries}
              anonymousPlayerId={anonymousPlayerId}
              isLoading={isLeaderboardLoading}
              error={leaderboardError}
            />
          </section>
        </div>
      ) : null}

      {isHowToPlayOpen ? (
        <div
          className="help-modal-backdrop how-to-play-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) {
              closeHowToPlay();
            }
          }}
        >
          <section
            className="help-modal how-to-play-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-to-play-title"
            ref={modalRef}
          >
            <div className="help-modal-header">
              <div>
                <span className="round-kicker">FIRST-TIME GUIDE</span>
                <h2 id="how-to-play-title">HOW TO PLAY</h2>
              </div>
              <button
                className="help-close-button"
                type="button"
                onClick={closeHowToPlay}
                aria-label="Close How to Play"
              >
                ×
              </button>
            </div>
            <ol className="how-to-play-steps">
              <li>
                <span>01</span>
                <p>
                  <strong>Build the best five you can.</strong> Draft PG, SG,
                  SF, PF, then C. Every pick is worth up to 20 points.
                </p>
              </li>
              <li>
                <span>02</span>
                <p>
                  <strong>Read the clues.</strong> Each round shows five mystery
                  players identified only by clues.
                </p>
              </li>
              <li>
                <span>03</span>
                <p>
                  <strong>Make your pick.</strong> Choose one player, then the
                  board reveals who everyone was and how rare they are.
                </p>
              </li>
              <li>
                <span>04</span>
                <p>
                  <strong>Protect your scoring ceiling.</strong> Every clue
                  helps, but powerups reduce the points available for that pick.
                  Each powerup is one-use per draft.
                </p>
              </li>
            </ol>
            <ScoringExample />
            <div className="how-to-play-actions">
              <button
                className="start-draft-button"
                type="button"
                onClick={closeHowToPlay}
              >
                START DRAFT
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

export default App;

import { useState } from 'react';

import {
  applyFranchisePlayer,
  createRound,
  resolveMysteryPlayer,
} from './game/round';
import {
  canUsePowerup,
  consumePowerup,
  createPowerupState,
  refreshPowerupReveals,
  resolvePowerupValues,
  type PowerupField,
  type PowerupId,
  type PowerupReveals,
  type UsedPowerups,
} from './game/powerups';
import {
  completeFinalBoardHistory,
  createDraftComparison,
  recordFinalBoard,
  type FinalBoardHistory,
} from './game/results';
import { getTeamPercentileLabel, type ProjectedRecord } from './game/scoring';
import { POSITIONS, type Player, type Position } from './types/player';

type PowerupDefinition = {
  id: PowerupId;
  label: string;
  description: string;
  field?: PowerupField;
};

type RevealPowerupDefinition = Omit<PowerupDefinition, 'id' | 'field'> & {
  id: Exclude<PowerupId, 'franchisePlayer'>;
  field: PowerupField;
};

const powerupDefinitions: PowerupDefinition[] = [
  {
    id: 'teamCheck',
    label: 'TEAM CHECK',
    description: 'Reveal all five teams',
    field: 'teamHint',
  },
  {
    id: 'timeline',
    label: 'TIMELINE',
    description: 'Reveal all five timelines',
    field: 'yearsActive',
  },
  {
    id: 'scout',
    label: 'SCOUT',
    description: 'Reveal all five scout notes',
    field: 'scoutHint',
  },
  {
    id: 'franchisePlayer',
    label: 'FRANCHISE PLAYER',
    description: 'Reroll this board with at least one ALL-TIMER guaranteed',
  },
];

const positionDetails: Record<Position, string> = {
  PG: 'CHOOSE YOUR POINT GUARD',
  SG: 'CHOOSE YOUR SHOOTING GUARD',
  SF: 'CHOOSE YOUR SMALL FORWARD',
  PF: 'CHOOSE YOUR POWER FORWARD',
  C: 'CHOOSE YOUR CENTER',
};

function formatTier(tier: Player['tier']) {
  return tier.replace('_', ' ');
}

function App() {
  const [currentPositionIndex, setCurrentPositionIndex] = useState(0);
  const [round, setRound] = useState(() => createRound(POSITIONS[0]));
  const [lineup, setLineup] = useState<Partial<Record<Position, Player>>>({});
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [revealedPlayers, setRevealedPlayers] = useState<
    Record<string, Player> | null
  >(null);
  const [usedPowerups, setUsedPowerups] = useState(createPowerupState);
  const [currentPowerupReveals, setCurrentPowerupReveals] =
    useState<PowerupReveals>({});
  const [isDraftComplete, setIsDraftComplete] = useState(false);
  const [seasonResult, setSeasonResult] = useState<ProjectedRecord | null>(
    null,
  );
  const [bestAvailableSeasonResult, setBestAvailableSeasonResult] =
    useState<ProjectedRecord | null>(null);
  const [bestAvailableLineup, setBestAvailableLineup] = useState<
    Player[] | null
  >(null);
  const [draftScore, setDraftScore] = useState<number | null>(null);
  const [bestAvailableScore, setBestAvailableScore] = useState<number | null>(
    null,
  );
  const [finalBoards, setFinalBoards] = useState<FinalBoardHistory>({});
  const [draftEfficiency, setDraftEfficiency] = useState<number | null>(null);

  const currentPosition = POSITIONS[currentPositionIndex];
  const revealedPowerups = powerupDefinitions.filter(
    (powerup): powerup is RevealPowerupDefinition => {
      if (!powerup.field || powerup.id === 'franchisePlayer') {
        return false;
      }

      return Boolean(currentPowerupReveals[powerup.id]);
    },
  );

  const handlePick = (optionId: string) => {
    if (selectedOptionId !== null) {
      return;
    }

    const selectedPlayer = resolveMysteryPlayer(round, optionId);

    if (!selectedPlayer) {
      throw new Error(`Unable to resolve mystery option ${optionId}`);
    }

    const playersByOption = round.options.reduce<Record<string, Player>>(
      (resolvedPlayers, option) => {
        const player = resolveMysteryPlayer(round, option.optionId);

        if (!player) {
          throw new Error(
            `Unable to resolve mystery option ${option.optionId}`,
          );
        }

        resolvedPlayers[option.optionId] = player;
        return resolvedPlayers;
      },
      {},
    );

    setSelectedOptionId(optionId);
    setRevealedPlayers(playersByOption);
    setLineup((currentLineup) => ({
      ...currentLineup,
      [currentPosition]: selectedPlayer,
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

    if (powerupId === 'franchisePlayer') {
      const nextRound = applyFranchisePlayer(round);
      setRound(nextRound);
      setRevealedPlayers(null);
      setUsedPowerups((currentState) =>
        consumePowerup(currentState, powerupId),
      );
      setCurrentPowerupReveals((currentReveals) =>
        refreshPowerupReveals(
          nextRound,
          currentReveals,
          resolveMysteryPlayer,
        ),
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
      const draftedLineup = POSITIONS.map((position) => {
        const player = lineup[position];

        if (!player) {
          throw new Error(`Missing lineup player for position ${position}`);
        }

        return player;
      });

      const finalBoard = round.options.map((option) => {
        const player = revealedPlayers[option.optionId];

        if (!player) {
          throw new Error(`Missing final board player for ${option.optionId}`);
        }

        return player;
      });
      const nextFinalBoards = recordFinalBoard(
        finalBoards,
        currentPosition,
        finalBoard,
      );
      const completeHistory = completeFinalBoardHistory(nextFinalBoards);
      const comparison = createDraftComparison(
        draftedLineup,
        completeHistory,
      );

      setFinalBoards(nextFinalBoards);
      setBestAvailableLineup(comparison.bestAvailableLineup);
      setSeasonResult(comparison.projectedRecord);
      setBestAvailableSeasonResult(comparison.bestAvailableRecord);
      setDraftScore(comparison.draftScore);
      setBestAvailableScore(comparison.bestAvailableScore);
      setDraftEfficiency(comparison.draftEfficiency);
      setIsDraftComplete(true);
      return;
    }

    const finalBoard = round.options.map((option) => {
      const player = revealedPlayers[option.optionId];

      if (!player) {
        throw new Error(`Missing final board player for ${option.optionId}`);
      }

      return player;
    });

    const nextPositionIndex = currentPositionIndex + 1;
    setFinalBoards((currentHistory) =>
      recordFinalBoard(currentHistory, currentPosition, finalBoard),
    );
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
    setCurrentPowerupReveals({});
    setIsDraftComplete(false);
    setSeasonResult(null);
    setBestAvailableSeasonResult(null);
    setBestAvailableLineup(null);
    setDraftScore(null);
    setBestAvailableScore(null);
    setFinalBoards({});
    setDraftEfficiency(null);
  };

  return (
    <main
      className={`game-shell ${isDraftComplete ? 'is-complete' : 'is-drafting'}`}
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
        <div
          className={`game-status ${isDraftComplete ? 'is-complete' : ''}`}
          data-testid="status-game"
        >
          <span className="status-dot" aria-hidden="true" />
          <span>{isDraftComplete ? 'FINAL WHISTLE' : 'PRE-GAME'}</span>
        </div>
      </header>

      <section
        className="game-content"
        aria-label={isDraftComplete ? undefined : 'Blind Five draft'}
        aria-labelledby={isDraftComplete ? 'game-title' : undefined}
      >
        <div className="eyebrow-row">
          <span className="eyebrow-rule" aria-hidden="true" />
          <p className="eyebrow">
            {isDraftComplete ? 'PROJECTED SEASON' : 'STARTING FIVE'}
          </p>
          <span className="eyebrow-rule" aria-hidden="true" />
        </div>

        {isDraftComplete ? (
          <>
            <h1 id="game-title" data-testid="text-game-title">
              DRAFT <em>COMPLETE</em>
            </h1>
            <p className="game-intro" data-testid="text-game-intro">
              Your starting five is locked in.
            </p>
          </>
        ) : (
          <>
            <div className="active-draft-heading">
              <div className="current-position" data-testid="current-position">
                <span className="current-position-label">ON THE CLOCK</span>
                <span className="current-position-value">{currentPosition}</span>
              </div>
              <span className="active-draft-count">
                {currentPositionIndex + 1} / {POSITIONS.length} POSITIONS
              </span>
            </div>
          </>
        )}

        <nav
          className="position-progress"
          aria-label="Lineup position progress"
          data-testid="progress-positions"
        >
          {POSITIONS.map((position, index) => (
            <div
              className={`position-step ${
                isDraftComplete || index < currentPositionIndex
                  ? 'is-completed'
                  : index === currentPositionIndex
                    ? 'is-active'
                    : 'is-upcoming'
              }`}
              key={position}
              data-testid={`progress-position-${position.toLowerCase()}`}
              aria-current={
                !isDraftComplete && index === currentPositionIndex
                  ? 'step'
                  : undefined
              }
            >
              <span className="position-index">0{index + 1}</span>
              <span className="position-code">{position}</span>
              <span className="position-name">
                {lineup[position]?.name ??
                  (index === currentPositionIndex ? 'ON THE CLOCK' : 'UP NEXT')}
              </span>
              <span className="position-tick" aria-hidden="true" />
            </div>
          ))}
        </nav>

        {isDraftComplete ? (
          <section
            className="draft-complete-panel"
            aria-labelledby="draft-complete-heading"
            data-testid="season-results"
          >
            {!seasonResult ? (
              <p className="results-error">Season result unavailable.</p>
            ) : (
              <>
                <div className="season-hero">
                  <span className="round-kicker">PROJECTED SEASON</span>
                  <div className="season-record" data-testid="season-record">
                    {seasonResult.wins} - {seasonResult.losses}
                  </div>
                  <strong className="historical-label" data-testid="historical-label">
                    {seasonResult.classification}
                  </strong>
                  <div className="season-stats">
                    <div>
                      <span>DRAFT SCORE</span>
                      <strong>{draftScore ?? 0} / 25</strong>
                    </div>
                    <div>
                      <span>DRAFT EFFICIENCY</span>
                      <strong>{draftEfficiency ?? 0}%</strong>
                    </div>
                    <div>
                      <span>TEAM PERCENTILE</span>
                      <strong>
                        {getTeamPercentileLabel(seasonResult.percentile)}
                      </strong>
                    </div>
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

                if (!player) {
                  throw new Error(`Missing lineup player for position ${position}`);
                }

                return (
                  <article className="lineup-slot" key={position}>
                    <span className="lineup-position">
                      0{index + 1} / {position}
                    </span>
                    <strong>{player.name}</strong>
                    <span className="lineup-tier">{formatTier(player.tier)}</span>
                  </article>
                );
              })}
            </div>

            {bestAvailableLineup && bestAvailableSeasonResult ? (
              <>
                <div className="completion-header best-available-header">
                  <div>
                    <span className="round-kicker">AVAILABLE BOARD CEILING</span>
                    <h2>BEST AVAILABLE FIVE</h2>
                  </div>
                  <span className="round-count">05 PLAYERS</span>
                </div>

                <div className="best-available-summary" data-testid="best-available-summary">
                  <div>
                    <span>BEST AVAILABLE SEASON</span>
                    <strong data-testid="best-available-record">
                      {bestAvailableSeasonResult.wins} - {bestAvailableSeasonResult.losses}
                    </strong>
                    <em>
                      {bestAvailableSeasonResult.classification}
                    </em>
                  </div>
                  <div>
                    <span>BEST AVAILABLE SCORE</span>
                    <strong>{bestAvailableScore ?? 0} / 25</strong>
                  </div>
                </div>

                <div className="lineup-grid best-available-grid">
                  {POSITIONS.map((position, index) => {
                    const player = bestAvailableLineup[index];

                    return (
                      <article className="lineup-slot best-available-slot" key={position}>
                        <span className="lineup-position">
                          0{index + 1} / {position}
                        </span>
                        <strong>{player.name}</strong>
                        <span className="lineup-tier">{formatTier(player.tier)}</span>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : null}

            <button
              className="restart-button"
              type="button"
              onClick={handleRestart}
              data-testid="draft-again"
            >
              Draft Again
            </button>
              </>
            )}
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
                  <h2>POWERUPS</h2>
                </div>
                <span className="round-count">
                  {Object.values(usedPowerups).filter(Boolean).length} / 4 USED
                </span>
              </div>

              <div className="powerup-grid">
                {powerupDefinitions.map((powerup) => {
                  const isUsed = usedPowerups[powerup.id];
                  const isLockedAfterPick =
                    selectedOptionId !== null && !isUsed;

                  return (
                    <button
                      className={`powerup-button ${
                        isUsed || isLockedAfterPick ? 'is-used' : ''
                      }`}
                      type="button"
                      disabled={isUsed || isLockedAfterPick}
                      key={powerup.id}
                      onClick={() => handleUsePowerup(powerup.id)}
                      data-testid={`powerup-${powerup.id}`}
                    >
                      <span className="powerup-label">{powerup.label}</span>
                      <span className="powerup-description">
                        {isUsed
                          ? 'USED'
                          : isLockedAfterPick
                            ? 'LOCKED AFTER PICK'
                            : powerup.description}
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
              <div className="round-corner round-corner-tl" aria-hidden="true" />
              <div className="round-corner round-corner-tr" aria-hidden="true" />
              <div className="round-corner round-corner-bl" aria-hidden="true" />
              <div className="round-corner round-corner-br" aria-hidden="true" />

              <div className="round-header">
                <div>
                  <span className="round-kicker">
                    {currentPosition} / MYSTERY ROUND
                  </span>
                  <h2>{positionDetails[currentPosition]}</h2>
                </div>
                <span className="round-count">05 OPTIONS</span>
              </div>

              <div className="mystery-card-grid">
                {round.options.map((option, index) => (
                  <article
                    className={`mystery-card ${
                      selectedOptionId === option.optionId
                        ? 'is-selected'
                        : selectedOptionId !== null
                          ? 'is-locked'
                          : ''
                    } ${
                      revealedPlayers?.[option.optionId]
                        ? `is-revealed tier-${revealedPlayers[
                            option.optionId
                          ].tier
                            .toLowerCase()
                            .replace('_', '-')}`
                        : ''
                    }`}
                    data-testid="mystery-card"
                    key={option.optionId}
                  >
                    <div className="card-topline">
                      <span>
                        {selectedOptionId === option.optionId
                          ? 'SELECTED'
                          : selectedOptionId !== null
                            ? 'LOCKED'
                            : `OPTION 0${index + 1}`}
                      </span>
                      <span aria-hidden="true">
                        {selectedOptionId === option.optionId ? 'SELECTED' : 'OPEN'}
                      </span>
                    </div>

                    <div
                      className={`card-identity ${
                        revealedPlayers?.[option.optionId] ? 'is-revealed' : ''
                      }`}
                      aria-label={
                        revealedPlayers?.[option.optionId]
                          ? `${revealedPlayers[option.optionId].name}, ${formatTier(revealedPlayers[option.optionId].tier)}`
                          : 'Mystery player'
                      }
                    >
                      {revealedPlayers?.[option.optionId] ? (
                        <div className="card-reveal" aria-live="polite">
                          <strong>{revealedPlayers[option.optionId].name}</strong>
                          <span>
                            {formatTier(revealedPlayers[option.optionId].tier)}
                          </span>
                        </div>
                      ) : (
                        '?'
                      )}
                    </div>

                    <div className="card-clues">
                      {option.hints.map((hint, hintIndex) => (
                        <p
                          className="card-clue"
                          key={`${option.optionId}-hint-${hintIndex}`}
                        >
                          {hint}
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
                              {currentPowerupReveals[powerup.id]?.[
                                option.optionId
                              ]}
                            </strong>
                          </p>
                        ))}
                      </div>
                    ) : null}

                    <button
                      className="pick-button"
                      type="button"
                      disabled={selectedOptionId !== null}
                      onClick={() => handlePick(option.optionId)}
                      data-testid={`pick-option-${option.optionId}`}
                    >
                      Pick
                    </button>
                  </article>
                ))}
              </div>

              {selectedOptionId !== null ? (
                <div className="continue-area">
                  <div>
                    <p className="selection-feedback" role="status" data-testid="status-selection">
                      {lineup[currentPosition]?.name} selected for {currentPosition}
                    </p>
                    <button
                      className="continue-button"
                      type="button"
                      onClick={handleContinue}
                      data-testid="continue-draft"
                    >
                      {currentPositionIndex === POSITIONS.length - 1
                        ? 'Finish Draft'
                        : 'Continue'}
                    </button>
                  </div>
                </div>
              ) : null}
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
    </main>
  );
}

export default App;
'use client';

import { useState, useCallback } from 'react';
import { ChairPosition, MatchState } from '../game/types';
import {
    createMatch,
    lockInPlayer,
    completeReveal,
    advanceRound,
    resetMatch,
    isValidSelection,
    getCurrentSplit,
    formatPercent,
} from '../game/gameEngine';
import ChairGrid from '../components/ChairGrid';
import PlayerPanel from '../components/PlayerPanel';
import TimerBar from '../components/TimerBar';
import RoundResultView from '../components/RoundResult';
import MatchResultComp from '../components/MatchResult';
import styles from './DemoPage.module.css';

const POT_AMOUNT = 10; // STRK
const TIMER_DURATION = 20; // seconds

export default function DemoPage() {
    const [state, setState] = useState<MatchState>(createMatch(POT_AMOUNT));
    const [showCountdown, setShowCountdown] = useState(false);
    const [countdownNumber, setCountdownNumber] = useState(3);

    // ── Chair Selection Handlers ──

    const handleSelectChair = useCallback((chair: ChairPosition) => {
        setState((prev) => {
            const isPlayerA = prev.phase === 'player_a_picking';
            const isPlayerB = prev.phase === 'player_b_picking';
            if (!isPlayerA && !isPlayerB) return prev;

            const key = isPlayerA ? 'playerAChoices' : 'playerBChoices';
            const currentChoices = prev[key];

            // Toggle position
            const newPosition = currentChoices.position === chair ? null : chair;
            // Remove chair from traps if it was a trap
            const newTraps = currentChoices.traps.filter((t) => t !== chair);

            return {
                ...prev,
                [key]: { position: newPosition, traps: newTraps },
            };
        });
    }, []);

    const handleToggleTrap = useCallback((chair: ChairPosition) => {
        setState((prev) => {
            const isPlayerA = prev.phase === 'player_a_picking';
            const isPlayerB = prev.phase === 'player_b_picking';
            if (!isPlayerA && !isPlayerB) return prev;

            const key = isPlayerA ? 'playerAChoices' : 'playerBChoices';
            const currentChoices = prev[key];

            // Can't trap your own chair
            if (currentChoices.position === chair) return prev;

            const isAlreadyTrapped = currentChoices.traps.includes(chair);
            let newTraps: ChairPosition[];

            if (isAlreadyTrapped) {
                newTraps = currentChoices.traps.filter((t) => t !== chair);
            } else {
                if (currentChoices.traps.length >= 3) return prev;
                newTraps = [...currentChoices.traps, chair];
            }

            return {
                ...prev,
                [key]: { ...currentChoices, traps: newTraps },
            };
        });
    }, []);

    // ── Lock In ──

    const handleLockIn = useCallback((player: 'a' | 'b') => {
        setState((prev) => {
            const choices = player === 'a' ? prev.playerAChoices : prev.playerBChoices;
            if (!isValidSelection(choices)) return prev;

            const newState = lockInPlayer(prev, player);

            // If it's now countdown phase, we'll run the timer
            return newState;
        });
    }, []);

    // ── Timer Complete → Reveal ──

    const handleTimerComplete = useCallback(() => {
        // Show 3-2-1 countdown before reveal
        setShowCountdown(true);
        setCountdownNumber(3);

        let count = 3;
        const countdown = setInterval(() => {
            count--;
            if (count <= 0) {
                clearInterval(countdown);
                setShowCountdown(false);
                // Resolve the round
                setState((prev) => completeReveal(prev));
            } else {
                setCountdownNumber(count);
            }
        }, 800);
    }, []);

    // ── Skip Timer (for testing) ──

    const handleSkipTimer = useCallback(() => {
        setState((prev) => completeReveal(prev));
    }, []);

    // ── Round Continue ──

    const handleRoundContinue = useCallback(() => {
        setState((prev) => advanceRound(prev));
    }, []);

    // ── Play Again ──

    const handlePlayAgain = useCallback(() => {
        setState(resetMatch(POT_AMOUNT));
    }, []);

    // ── Derived State ──

    const isPlayerAPicking = state.phase === 'player_a_picking';
    const isPlayerBPicking = state.phase === 'player_b_picking';
    const isCountdown = state.phase === 'countdown';
    const isRoundResult = state.phase === 'round_result';
    const isMatchResult = state.phase === 'match_result';

    const activeChoices = isPlayerAPicking
        ? state.playerAChoices
        : isPlayerBPicking
            ? state.playerBChoices
            : state.playerAChoices; // default

    const currentSplit = getCurrentSplit(state.roundResults);
    const latestResult = state.roundResults[state.roundResults.length - 1];

    return (
        <div className={styles.page}>
            {/* Header */}
            <header className={styles.header}>
                <h1 className={styles.title}>🎵 Last Chair</h1>
                <div className={styles.meta}>
                    <span className={styles.roundBadge}>Round {state.currentRound}/3</span>
                    <span className={styles.potBadge}>💰 {POT_AMOUNT} STRK</span>
                </div>
                {state.roundResults.length > 0 && (
                    <div className={styles.splitMini}>
                        <span style={{ color: '#ff6b9d' }}>🧑‍🎤 {formatPercent(currentSplit.playerA)}</span>
                        <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
                        <span style={{ color: '#4ecdc4' }}>🧑‍🚀 {formatPercent(currentSplit.playerB)}</span>
                    </div>
                )}
            </header>

            {/* Game Area */}
            <div className={styles.gameArea}>
                <PlayerPanel
                    player="a"
                    choices={state.playerAChoices}
                    isActive={isPlayerAPicking}
                    isLocked={state.playerALocked}
                    onLockIn={() => handleLockIn('a')}
                    roundCoefficient={latestResult?.coefficients.playerA}
                />

                <div className={styles.centerArea}>
                    {/* Screen for Player B so they can't see Player A's picks */}
                    {isPlayerBPicking && (
                        <div className={styles.screenOverlay}>
                            <span className={styles.screenEmoji}>🙈</span>
                            <span className={styles.screenText}>Player 1&apos;s choices are hidden</span>
                        </div>
                    )}

                    <ChairGrid
                        choices={activeChoices}
                        disabled={isCountdown || isRoundResult || isMatchResult}
                        revealMode={false}
                        onSelectChair={handleSelectChair}
                        onToggleTrap={handleToggleTrap}
                    />

                    {/* Timer */}
                    {isCountdown && (
                        <div className={styles.timerArea}>
                            <TimerBar
                                duration={TIMER_DURATION}
                                isRunning={true}
                                onComplete={handleTimerComplete}
                            />
                            <button className={styles.skipBtn} onClick={handleSkipTimer}>
                                ⏭️ Skip Timer
                            </button>
                        </div>
                    )}

                    {/* Countdown overlay */}
                    {showCountdown && (
                        <div className={styles.countdownOverlay}>
                            <span className={styles.countdownNumber}>{countdownNumber}</span>
                            <span className={styles.countdownText}>Music stops in…</span>
                        </div>
                    )}
                </div>

                <PlayerPanel
                    player="b"
                    choices={state.playerBChoices}
                    isActive={isPlayerBPicking}
                    isLocked={state.playerBLocked}
                    onLockIn={() => handleLockIn('b')}
                    roundCoefficient={latestResult?.coefficients.playerB}
                />
            </div>

            {/* Phase indicator */}
            <div className={styles.phaseIndicator}>
                {isPlayerAPicking && '🧑‍🎤 Player 1 is picking chair & traps…'}
                {isPlayerBPicking && '🧑‍🚀 Player 2 is picking chair & traps…'}
                {isCountdown && '🎵 Music is playing…'}
            </div>

            {/* Round Result Overlay */}
            {isRoundResult && latestResult && (
                <RoundResultView
                    roundNumber={state.currentRound}
                    result={latestResult}
                    allResults={state.roundResults}
                    potAmount={POT_AMOUNT}
                    onContinue={handleRoundContinue}
                    isFinalRound={state.currentRound >= 3}
                />
            )}

            {/* Match Result Overlay */}
            {isMatchResult && state.finalSplit && (
                <MatchResultComp
                    roundResults={state.roundResults}
                    finalSplit={state.finalSplit}
                    potAmount={POT_AMOUNT}
                    onPlayAgain={handlePlayAgain}
                />
            )}
        </div>
    );
}

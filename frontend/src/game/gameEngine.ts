// ── Last Chair Game Engine ──
// Pure logic, no UI. Handles state machine, risk calculation, round settlement.

import {
    ChairPosition,
    PlayerChoices,
    RoundResult,
    RoundOutcome,
    RoundCoefficients,
    MatchState,
    GamePhase,
    getRiskFactor,
} from './types';

// ── Validation ──

export function isValidSelection(choices: PlayerChoices): boolean {
    if (!choices.position) return false;
    if (choices.traps.length !== 3) return false;

    // All traps must be valid positions
    for (const trap of choices.traps) {
        if (trap < 1 || trap > 12) return false;
    }

    // No duplicate traps
    const trapSet = new Set(choices.traps);
    if (trapSet.size !== 3) return false;

    // Can't trap your own chair
    if (trapSet.has(choices.position)) return false;

    return true;
}

// ── Round Resolution ──

export function resolveRound(
    playerAChoices: PlayerChoices,
    playerBChoices: PlayerChoices
): RoundResult {
    const aTrapped = playerBChoices.traps.includes(playerAChoices.position!);
    const bTrapped = playerAChoices.traps.includes(playerBChoices.position!);

    let outcome: RoundOutcome;
    let description: string;

    if (aTrapped && bTrapped) {
        outcome = 'both_trapped';
        description = '💥 Both players got trapped! Mutual destruction!';
    } else if (aTrapped) {
        outcome = 'a_trapped';
        description = `💣 Player 1 sat on a trap! Player 2's trap on chair ${playerAChoices.position} hit!`;
    } else if (bTrapped) {
        outcome = 'b_trapped';
        description = `💣 Player 2 sat on a trap! Player 1's trap on chair ${playerBChoices.position} hit!`;
    } else {
        outcome = 'both_safe';
        description = `✅ Both players survived! Chair ${playerAChoices.position} vs Chair ${playerBChoices.position}`;
    }

    const coefficients = calculateRoundCoefficients(
        playerAChoices,
        playerBChoices,
        outcome
    );

    return {
        playerAChoices: { ...playerAChoices },
        playerBChoices: { ...playerBChoices },
        outcome,
        coefficients,
        description,
    };
}

// ── Risk Calculation ──
//
// Round coefficient per player:
//   - survival (0 or 1) × riskFactor(position)
//   - + trapBonus (0.1) if you trapped the opponent
//
// riskFactor = position / 12  →  chair 1 = 0.083, chair 12 = 1.0

function calculateRoundCoefficients(
    playerAChoices: PlayerChoices,
    playerBChoices: PlayerChoices,
    outcome: RoundOutcome
): RoundCoefficients {
    const aRisk = getRiskFactor(playerAChoices.position!);
    const bRisk = getRiskFactor(playerBChoices.position!);

    const aSurvived = outcome !== 'a_trapped' && outcome !== 'both_trapped';
    const bSurvived = outcome !== 'b_trapped' && outcome !== 'both_trapped';

    const aTrapBonus = (outcome === 'b_trapped' || outcome === 'both_trapped') ? 0.1 : 0;
    const bTrapBonus = (outcome === 'a_trapped' || outcome === 'both_trapped') ? 0.1 : 0;

    const playerA = (aSurvived ? aRisk : 0) + aTrapBonus;
    const playerB = (bSurvived ? bRisk : 0) + bTrapBonus;

    return { playerA, playerB };
}

// ── Match Settlement ──
//
// After 3 rounds, sum all coefficients.
// Final split = sumA / (sumA + sumB)
// If both sums are 0 → 50/50

export function settleMatch(
    roundResults: RoundResult[]
): { playerA: number; playerB: number } {
    let sumA = 0;
    let sumB = 0;

    for (const result of roundResults) {
        sumA += result.coefficients.playerA;
        sumB += result.coefficients.playerB;
    }

    const total = sumA + sumB;

    if (total === 0) {
        return { playerA: 0.5, playerB: 0.5 };
    }

    return {
        playerA: sumA / total,
        playerB: sumB / total,
    };
}

// ── Match State Factory ──

export function createMatch(potAmount: number = 10): MatchState {
    return {
        phase: 'player_a_picking',
        currentRound: 1,
        roundResults: [],
        playerAChoices: { position: null, traps: [] },
        playerBChoices: { position: null, traps: [] },
        playerALocked: false,
        playerBLocked: false,
        finalSplit: null,
        potAmount,
    };
}

// ── State Transitions ──

export function lockInPlayer(
    state: MatchState,
    player: 'a' | 'b'
): MatchState {
    const newState = { ...state };

    if (player === 'a') {
        newState.playerALocked = true;
        newState.phase = 'player_b_picking';
    } else {
        newState.playerBLocked = true;
        newState.phase = 'countdown';
    }

    return newState;
}

export function startReveal(state: MatchState): MatchState {
    return { ...state, phase: 'revealing' };
}

export function completeReveal(state: MatchState): MatchState {
    const result = resolveRound(state.playerAChoices, state.playerBChoices);
    const newResults = [...state.roundResults, result];

    return {
        ...state,
        phase: 'round_result',
        roundResults: newResults,
    };
}

export function advanceRound(state: MatchState): MatchState {
    if (state.currentRound >= 3) {
        // Match over — settle
        const split = settleMatch(state.roundResults);
        return {
            ...state,
            phase: 'match_result',
            finalSplit: split,
        };
    }

    return {
        ...state,
        phase: 'player_a_picking',
        currentRound: state.currentRound + 1,
        playerAChoices: { position: null, traps: [] },
        playerBChoices: { position: null, traps: [] },
        playerALocked: false,
        playerBLocked: false,
    };
}

export function resetMatch(potAmount: number = 10): MatchState {
    return createMatch(potAmount);
}

// ── Helpers ──

export function getCurrentSplit(roundResults: RoundResult[]): { playerA: number; playerB: number } {
    if (roundResults.length === 0) {
        return { playerA: 0.5, playerB: 0.5 };
    }
    return settleMatch(roundResults);
}

export function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

export function formatPayout(split: number, pot: number): string {
    const fee = pot * 0.01;
    const netPot = pot - fee;
    return `${(split * netPot).toFixed(2)} STRK`;
}

// ── Last Chair Game Types ──

export type ChairPosition = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface PlayerChoices {
    position: ChairPosition | null;
    traps: ChairPosition[];
}

export interface PlayerCommitment {
    choices: PlayerChoices;
    salt: bigint;
    hash: string;
}

export type RoundOutcome = 'a_trapped' | 'b_trapped' | 'both_trapped' | 'both_safe';

export interface RoundCoefficients {
    playerA: number;
    playerB: number;
}

export interface RoundResult {
    playerAChoices: PlayerChoices;
    playerBChoices: PlayerChoices;
    outcome: RoundOutcome;
    coefficients: RoundCoefficients;
    description: string;
}

export type GamePhase =
    | 'player_a_picking'
    | 'player_b_picking'
    | 'countdown'
    | 'revealing'
    | 'round_result'
    | 'round_transition'
    | 'match_result';

export interface MatchState {
    phase: GamePhase;
    currentRound: number; // 1, 2, or 3
    roundResults: RoundResult[];
    playerAChoices: PlayerChoices;
    playerBChoices: PlayerChoices;
    playerALocked: boolean;
    playerBLocked: boolean;
    finalSplit: { playerA: number; playerB: number } | null;
    potAmount: number;
}

// Chair emoji mapping
export const CHAIR_EMOJIS = {
    empty: '🪑',
    selected: '⭐',
    trapped: '💣',
    revealedTrap: '💥',
    revealedSafe: '✅',
    eliminated: '☠️',
} as const;

// Risk factor: chair position (1-12) divided by 12
export function getRiskFactor(position: ChairPosition): number {
    return position / 12;
}

'use client';

import { ChairPosition, PlayerChoices } from '../game/types';
import styles from './ChairGrid.module.css';

interface ChairGridProps {
    choices: PlayerChoices;
    opponentChoices?: PlayerChoices; // Only shown during reveal
    onSelectChair: (chair: ChairPosition) => void;
    onToggleTrap: (chair: ChairPosition) => void;
    disabled: boolean;
    revealMode: boolean;
    revealedIndex?: number; // For staggered reveal animation
}

const POSITIONS: ChairPosition[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export default function ChairGrid({
    choices,
    opponentChoices,
    onSelectChair,
    onToggleTrap,
    disabled,
    revealMode,
    revealedIndex = -1,
}: ChairGridProps) {
    function getChairState(chair: ChairPosition) {
        if (revealMode && opponentChoices) {
            const isRevealed = chair <= revealedIndex;
            const isMyPos = choices.position === chair;
            const isOppPos = opponentChoices.position === chair;
            const isMyTrap = choices.traps.includes(chair);
            const isOppTrap = opponentChoices.traps.includes(chair);

            if (!isRevealed) return 'hidden';

            // Trap reveal
            if (isMyPos && isOppTrap) return 'eliminated'; // I sat on their trap
            if (isOppPos && isMyTrap) return 'trapped-opponent'; // They sat on my trap
            if (isMyPos) return 'my-position-safe';
            if (isOppPos) return 'opp-position-safe';
            if (isMyTrap) return 'my-trap-revealed';
            if (isOppTrap) return 'opp-trap-revealed';
            return 'empty-revealed';
        }

        // Selection mode
        if (choices.position === chair) return 'selected';
        if (choices.traps.includes(chair)) return 'trapped';
        return 'empty';
    }

    function getChairEmoji(state: string) {
        switch (state) {
            case 'selected': return '⭐';
            case 'trapped': return '💣';
            case 'eliminated': return '☠️';
            case 'trapped-opponent': return '💥';
            case 'my-position-safe': return '🏆';
            case 'opp-position-safe': return '🎯';
            case 'my-trap-revealed': return '💣';
            case 'opp-trap-revealed': return '🔴';
            case 'hidden': return '❓';
            case 'empty-revealed': return '🪑';
            default: return '🪑';
        }
    }

    function handleClick(chair: ChairPosition) {
        if (disabled || revealMode) return;

        // If no position selected yet, or clicking the current position → toggle position
        if (!choices.position || choices.position === chair) {
            onSelectChair(chair);
            return;
        }

        // If clicking an existing trap → remove it
        if (choices.traps.includes(chair)) {
            onToggleTrap(chair);
            return;
        }

        // Otherwise → add trap (if under 3)
        if (choices.traps.length < 3) {
            onToggleTrap(chair);
        }
    }

    return (
        <div className={styles.gridContainer}>
            <div className={styles.circleGrid}>
                {POSITIONS.map((chair) => {
                    const state = getChairState(chair);
                    return (
                        <button
                            key={chair}
                            className={`${styles.chair} ${styles[`chair${chair}`]} ${styles[`state-${state}`]}`}
                            onClick={() => handleClick(chair)}
                            disabled={disabled || revealMode}
                            title={`Chair ${chair} (Risk: ${((chair / 12) * 100).toFixed(0)}%)`}
                        >
                            <span className={styles.emoji}>{getChairEmoji(state)}</span>
                            <span className={styles.number}>{chair}</span>
                            <span className={styles.risk}>
                                {state === 'selected' || state === 'my-position-safe' || state === 'eliminated'
                                    ? `${((chair / 12) * 100).toFixed(0)}%`
                                    : ''
                                }
                            </span>
                        </button>
                    );
                })}
                <div className={styles.centerLabel}>
                    <span className={styles.centerEmoji}>🎵</span>
                    <span className={styles.centerText}>Last Chair</span>
                </div>
            </div>
            {!revealMode && !disabled && (
                <div className={styles.instructions}>
                    {!choices.position
                        ? '⭐ Click a chair to sit in'
                        : choices.traps.length < 3
                            ? `💣 Place ${3 - choices.traps.length} more trap${3 - choices.traps.length > 1 ? 's' : ''}`
                            : '✅ Ready to lock in!'
                    }
                </div>
            )}
        </div>
    );
}

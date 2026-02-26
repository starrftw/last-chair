'use client';

import { PlayerChoices } from '../game/types';
import { isValidSelection } from '../game/gameEngine';
import styles from './PlayerPanel.module.css';

interface PlayerPanelProps {
    player: 'a' | 'b';
    choices: PlayerChoices;
    isActive: boolean;
    isLocked: boolean;
    onLockIn: () => void;
    roundCoefficient?: number;
}

const AVATARS = { a: '🧑‍🎤', b: '🧑‍🚀' };
const LABELS = { a: 'Player 1', b: 'Player 2' };
const COLORS = { a: '#ff6b9d', b: '#4ecdc4' };

export default function PlayerPanel({
    player,
    choices,
    isActive,
    isLocked,
    onLockIn,
    roundCoefficient,
}: PlayerPanelProps) {
    const valid = isValidSelection(choices);
    const label = LABELS[player];
    const avatar = AVATARS[player];
    const color = COLORS[player];

    return (
        <div
            className={`${styles.panel} ${isActive ? styles.active : ''} ${isLocked ? styles.locked : ''}`}
            style={{ '--player-color': color } as React.CSSProperties}
        >
            <div className={styles.header}>
                <span className={styles.avatar}>{avatar}</span>
                <span className={styles.label}>{label}</span>
            </div>

            <div className={styles.status}>
                {isLocked ? (
                    <span className={styles.lockedBadge}>🔒 Locked In</span>
                ) : isActive ? (
                    <span className={styles.activeBadge}>🎯 Your Turn</span>
                ) : (
                    <span className={styles.waitingBadge}>⏳ Waiting</span>
                )}
            </div>

            {isActive && !isLocked && (
                <div className={styles.selectionInfo}>
                    <div className={styles.selectionRow}>
                        <span>Chair:</span>
                        <span>{choices.position ? `⭐ ${choices.position}` : '—'}</span>
                    </div>
                    <div className={styles.selectionRow}>
                        <span>Traps:</span>
                        <span>
                            {choices.traps.length > 0
                                ? choices.traps.map((t) => `💣${t}`).join(' ')
                                : '—'}
                        </span>
                    </div>
                </div>
            )}

            {roundCoefficient !== undefined && (
                <div className={styles.coefficient}>
                    <span className={styles.coeffLabel}>Round Score</span>
                    <span className={styles.coeffValue}>{roundCoefficient.toFixed(3)}</span>
                </div>
            )}

            {isActive && !isLocked && (
                <button
                    className={styles.lockButton}
                    onClick={onLockIn}
                    disabled={!valid}
                >
                    {valid ? '🔒 Lock In' : `Select ${!choices.position ? 'a chair' : `${3 - choices.traps.length} trap${3 - choices.traps.length !== 1 ? 's' : ''}`}`}
                </button>
            )}
        </div>
    );
}

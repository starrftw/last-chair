'use client';

import styles from './ChairGrid.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChairGridProps {
  // Active player's state
  chair:    number;         // 1-12, player's chosen chair
  traps:    number[];       // up to 3 trap positions

  // Opponent reveal (only shown after round ends)
  opponentChair?: number;
  opponentTraps?: number[];

  onSelectChair:  (chair: number) => void;
  onToggleTrap:   (chair: number) => void;
  disabled:       boolean;
  revealMode:     boolean;
  revealedIndex?: number;   // for staggered reveal animation
}

const POSITIONS = [1,2,3,4,5,6,7,8,9,10,11,12] as const;

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChairGrid({
  chair,
  traps,
  opponentChair,
  opponentTraps = [],
  onSelectChair,
  onToggleTrap,
  disabled,
  revealMode,
  revealedIndex = -1,
}: ChairGridProps) {

  function getChairState(c: number): string {
    if (revealMode && opponentChair != null) {
      const isRevealed = c <= revealedIndex;
      if (!isRevealed) return 'hidden';

      const isMyChair    = chair === c;
      const isOppChair   = opponentChair === c;
      const isMyTrap     = traps.includes(c);
      const isOppTrap    = opponentTraps.includes(c);

      if (isMyChair  && isOppTrap) return 'eliminated';        // I sat on their trap
      if (isOppChair && isMyTrap)  return 'trapped-opponent';  // They sat on my trap
      if (isMyChair)               return 'my-position-safe';
      if (isOppChair)              return 'opp-position-safe';
      if (isMyTrap)                return 'my-trap-revealed';
      if (isOppTrap)               return 'opp-trap-revealed';
      return 'empty-revealed';
    }

    // Selection mode
    if (chair === c)        return 'selected';
    if (traps.includes(c))  return 'trapped';
    return 'empty';
  }

  function getChairEmoji(state: string): string {
    switch (state) {
      case 'selected':          return '⭐';
      case 'trapped':           return '💣';
      case 'eliminated':        return '☠️';
      case 'trapped-opponent':  return '💥';
      case 'my-position-safe':  return '🏆';
      case 'opp-position-safe': return '🎯';
      case 'my-trap-revealed':  return '💣';
      case 'opp-trap-revealed': return '🔴';
      case 'hidden':            return '❓';
      case 'empty-revealed':    return '🪑';
      default:                  return '🪑';
    }
  }

  function handleClick(c: number) {
    if (disabled || revealMode) return;

    // Clicking current chair → deselect (revert to no chair)
    if (chair === c) {
      onSelectChair(0);
      return;
    }

    // Clicking a trap → remove it
    if (traps.includes(c)) {
      onToggleTrap(c);
      return;
    }

    // No chair selected yet → set chair
    if (!chair || chair === 0) {
      onSelectChair(c);
      return;
    }

    // Chair already set → add/replace trap
    if (traps.length < 3) {
      onToggleTrap(c);
    }
    // All 3 traps placed — do nothing until one is removed
  }

  const trapsPlaced = traps.filter(t => t > 0).length;

  return (
    <div className={styles.gridContainer}>
      <div className={styles.circleGrid}>
        {POSITIONS.map((c) => {
          const state = getChairState(c);
          return (
            <button
              key={c}
              className={[
                styles.chair,
                styles[`chair${c}`],
                styles[`state-${state}`],
              ].join(' ')}
              onClick={() => handleClick(c)}
              disabled={disabled || revealMode}
              title={`Chair ${c} — Risk ${Math.round((c / 12) * 100)}%`}
            >
              <span className={styles.emoji}>{getChairEmoji(state)}</span>
              <span className={styles.number}>{c}</span>
              {(state === 'selected' || state === 'my-position-safe' || state === 'eliminated') && (
                <span className={styles.risk}>{Math.round((c / 12) * 100)}%</span>
              )}
            </button>
          );
        })}

        <div className={styles.centerLabel}>
          <span className={styles.centerEmoji}>🎵</span>
          <span className={styles.centerText}>Last Chair</span>
        </div>
      </div>

      {/* Instructions — only in selection mode */}
      {!revealMode && !disabled && (
        <div className={styles.instructions}>
          {!chair || chair === 0
            ? '⭐ Click a chair to sit in'
            : trapsPlaced < 3
              ? `💣 Set ${3 - trapsPlaced} more trap${3 - trapsPlaced > 1 ? 's' : ''}`
              : '✅ Loadout set — timer running'
          }
        </div>
      )}
    </div>
  );
}

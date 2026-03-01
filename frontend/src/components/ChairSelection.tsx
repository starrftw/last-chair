'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Loadout } from './GameFlow';
import ChairGrid from './ChairGrid';
import TimerBar from './TimerBar';
import styles from './ChairSelection.module.css';

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChairSelectionProps {
  matchId:        string;
  roundNumber:    number;
  playerRole:     'a' | 'b';
  loadout:        Loadout;
  onLoadoutChange: (l: Loadout) => void;
  onRoundEnd:     (finalLoadout: Loadout) => void;  // fires when timer hits 0
  timerSeconds:   number;
  isRevealing:    boolean;   // true while proof generating / submitting
  revealStatus:   string;    // status message during reveal
  splitA:         number;    // cumulative % for player A
  splitB:         number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChairSelection({
  matchId,
  roundNumber,
  playerRole,
  loadout,
  onLoadoutChange,
  onRoundEnd,
  timerSeconds,
  isRevealing,
  revealStatus,
  splitA,
  splitB,
}: ChairSelectionProps) {

  // Snapshot loadout at component mount — this is what was committed on-chain
  // Player can change during timer but the committed values are what matter for ZK
  const committedLoadout = useRef<Loadout>(loadout);

  const [timerDone, setTimerDone] = useState(false);
  const [localLoadout, setLocalLoadout] = useState<Loadout>(loadout);

  // Sync local loadout to parent
  const handleLoadoutChange = useCallback((l: Loadout) => {
    setLocalLoadout(l);
    onLoadoutChange(l);
  }, [onLoadoutChange]);

  // Chair select — first click sets chair, unless it's already a trap
  const handleSelectChair = useCallback((chair: number) => {
    if (isRevealing || timerDone) return;
    if ([localLoadout.trap1, localLoadout.trap2, localLoadout.trap3].includes(chair)) return;
    handleLoadoutChange({ ...localLoadout, chair });
  }, [localLoadout, isRevealing, timerDone, handleLoadoutChange]);

  // Trap toggle — right click or separate mode
  const handleToggleTrap = useCallback((chair: number) => {
    if (isRevealing || timerDone) return;
    if (chair === localLoadout.chair) return; // can't trap your own chair

    const traps = [localLoadout.trap1, localLoadout.trap2, localLoadout.trap3];
    const isAlreadyTrap = traps.includes(chair);

    if (isAlreadyTrap) {
      // Remove trap — shift others
      const newTraps = traps.filter(t => t !== chair);
      // Fill removed slot with 0 temporarily — keep other traps
      handleLoadoutChange({
        ...localLoadout,
        trap1: newTraps[0] ?? localLoadout.trap1,
        trap2: newTraps[1] ?? localLoadout.trap2,
        trap3: newTraps[2] ?? localLoadout.trap3,
      });
    } else if (traps.filter(t => t > 0).length < 3) {
      // Add trap to first empty slot
      const newTraps = [...traps];
      const emptyIdx = newTraps.findIndex(t => t === 0);
      if (emptyIdx >= 0) newTraps[emptyIdx] = chair;
      else return; // all 3 slots full
      handleLoadoutChange({
        ...localLoadout,
        trap1: newTraps[0],
        trap2: newTraps[1],
        trap3: newTraps[2],
      });
    }
    // If 3 traps already set, ignore until one is removed
  }, [localLoadout, isRevealing, timerDone, handleLoadoutChange]);

  // Timer ends — fire with COMMITTED loadout (what was on-chain at match start)
  // Note: GameFlow uses committedLoadout for proof, not the locally changed one
  // The local changes are cosmetic during the round unless player re-signs
  const handleTimerEnd = useCallback(() => {
    setTimerDone(true);
    onRoundEnd(committedLoadout.current);
  }, [onRoundEnd]);

  const isPlayer = playerRole === 'a' ? 'A' : 'B';
  const myPct = playerRole === 'a' ? splitA : splitB;
  const theirPct = playerRole === 'a' ? splitB : splitA;

  return (
    <div className={styles.container}>

      {/* Header row */}
      <div className={styles.header}>
        <div className={styles.roundBadge}>
          Round {roundNumber} / 3
        </div>
        <div className={styles.matchId}>
          #{matchId.slice(-6)}
        </div>
      </div>

      {/* Cumulative split bar */}
      {roundNumber > 1 && (
        <div className={styles.splitBar}>
          <span className={styles.splitYou}>{myPct}%</span>
          <div className={styles.splitTrack}>
            <div
              className={styles.splitFill}
              style={{ width: `${myPct}%` }}
            />
          </div>
          <span className={styles.splitThem}>{theirPct}%</span>
        </div>
      )}

      {/* Timer */}
      <TimerBar
        duration={timerSeconds}
        isRunning={!timerDone && !isRevealing}
        onComplete={handleTimerEnd}
      />

      {/* Selection summary */}
      <div className={styles.selectionSummary}>
        <div className={styles.selectionItem}>
          <span className={styles.selectionLabel}>Your Chair</span>
          <span className={styles.selectionValue}>
            ⭐ {localLoadout.chair}
          </span>
        </div>
        <div className={styles.selectionItem}>
          <span className={styles.selectionLabel}>Traps Set</span>
          <span className={styles.selectionValue}>
            💣{localLoadout.trap1} 💣{localLoadout.trap2} 💣{localLoadout.trap3}
          </span>
        </div>
      </div>

      {/* Chair Grid — always visible */}
      <div className={styles.gameArea}>
        <ChairGrid
          chair={localLoadout.chair}
          traps={[localLoadout.trap1, localLoadout.trap2, localLoadout.trap3]}
          onSelectChair={handleSelectChair}
          onToggleTrap={handleToggleTrap}
          disabled={isRevealing || timerDone}
          revealMode={false}
        />
      </div>

      {/* Reveal overlay — shown on top of board, not replacing it */}
      {isRevealing && (
        <div className={styles.revealOverlay}>
          <div className={styles.spinner} />
          <p className={styles.revealStatus}>{revealStatus || 'Calculating...'}</p>
        </div>
      )}

      {/* NO lock-in button — timer drives everything */}
    </div>
  );
}

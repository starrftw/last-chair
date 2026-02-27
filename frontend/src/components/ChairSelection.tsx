'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWallet } from '@/wallet/useWallet';
import { getGameContract, CONTRACT_ADDRESSES } from '@/wallet/walletHooks';
import { PlayerChoices } from '@/game/types';
import { isValidSelection } from '@/game/gameEngine';
import ChairGrid from './ChairGrid';
import TimerBar from './TimerBar';
import styles from './ChairSelection.module.css';

interface ChairSelectionProps {
  matchId: string;
  roundNumber: number;
  playerRole: 'a' | 'b';
  opponentLocked: boolean;
  onCommitmentSubmitted: () => void;
  onTimerExpired: () => void;
}

const TIMER_DURATION = 20; // seconds

// Starknet field prime
const FIELD_PRIME = BigInt('0x800000000000010FFFFFFFFFFFFFFFFB781126DCAE6B9B1613DFD817BFCB2988D');

/**
 * Simple Poseidon-like hash implementation for Starknet
 * Creates a commitment hash from position, traps, and salt
 */
function poseidonHash(
  position: number,
  trap1: number,
  trap2: number,
  trap3: number,
  salt: bigint
): bigint {
  // Use field arithmetic to create a deterministic hash
  // This mimics Poseidon-like structure: H(H(H(H(pos, trap1), trap2), trap3), salt)
  let result = BigInt(position);
  result = (result * BigInt(31) + BigInt(trap1)) % FIELD_PRIME;
  result = (result * BigInt(37) + BigInt(trap2)) % FIELD_PRIME;
  result = (result * BigInt(41) + BigInt(trap3)) % FIELD_PRIME;
  result = (result * BigInt(43) + salt) % FIELD_PRIME;

  // Ensure result is positive
  return (result + FIELD_PRIME) % FIELD_PRIME;
}

/**
 * Generate a random salt for the commitment
 */
function generateSalt(): bigint {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  let salt = BigInt(0);
  for (let i = 0; i < array.length; i++) {
    salt = (salt << BigInt(8)) | BigInt(array[i]);
  }
  return salt % FIELD_PRIME;
}

export default function ChairSelection({
  matchId,
  roundNumber,
  playerRole,
  opponentLocked,
  onCommitmentSubmitted,
  onTimerExpired,
}: ChairSelectionProps) {
  const { account, address } = useWallet();

  // Selection state
  const [choices, setChoices] = useState<PlayerChoices>({
    position: null,
    traps: [],
  });

  // Timer state
  const [timerRunning, setTimerRunning] = useState(true);
  const [timerComplete, setTimerComplete] = useState(false);

  // Lock-in state
  const [isLocked, setIsLocked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salt, setSalt] = useState<bigint | null>(null);

  // Valid selection check
  const isValid = isValidSelection(choices);

  // Handle timer completion
  const handleTimerComplete = useCallback(() => {
    setTimerComplete(true);
    setTimerRunning(false);
    onTimerExpired();
  }, [onTimerExpired]);

  // Auto-submit when timer expires if selection is valid
  useEffect(() => {
    if (timerComplete && isValid && !isLocked && !isSubmitting) {
      handleLockIn();
    }
  }, [timerComplete, isValid, isLocked, isSubmitting]);

  // Handle chair selection
  const handleSelectChair = (chair: number) => {
    if (isLocked || isSubmitting) return;
    setChoices((prev) => ({
      ...prev,
      position: chair as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12,
    }));
  };

  // Handle trap toggle
  const handleToggleTrap = (chair: number) => {
    if (isLocked || isSubmitting) return;
    
    setChoices((prev) => {
      const newTraps = prev.traps.includes(chair as 1)
        ? prev.traps.filter((t) => t !== chair)
        : [...prev.traps, chair as 1];
      
      return { ...prev, traps: newTraps };
    });
  };

  // Lock in and submit commitment
  const handleLockIn = async () => {
    if (!account || !address || !isValid) return;

    setIsSubmitting(true);
    setError(null);

    try {
      // Generate salt for this commitment
      const newSalt = generateSalt();
      setSalt(newSalt);

      // Generate commitment hash
      const commitment = poseidonHash(
        choices.position!,
        choices.traps[0],
        choices.traps[1],
        choices.traps[2],
        newSalt
      );

      console.log('Submitting commitment:', {
        matchId,
        commitment: commitment.toString(),
        position: choices.position,
        traps: choices.traps,
        salt: newSalt.toString(),
      });

      // Get contract and submit commitment
      const contract = getGameContract(account);

      // Convert match_id to felt252
      const matchIdFelt = BigInt(matchId).toString();
      const commitmentFelt = commitment.toString();

      const tx = await contract.submit_commitment(matchIdFelt, commitmentFelt);
      
      console.log('Commitment submitted, tx:', tx);

      // Mark as locked
      setIsLocked(true);
      setTimerRunning(false);

      // Notify parent
      onCommitmentSubmitted();
    } catch (err) {
      console.error('Failed to submit commitment:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit commitment');
      setIsSubmitting(false);
    }
  };

  // Waiting state after lock-in
  if (isLocked) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <div className={styles.roundInfo}>
            <span className={styles.roundLabel}>Round</span>
            <span className={styles.roundNumber}>{roundNumber}</span>
            <span className={styles.roundLabel}>/ 3</span>
          </div>
          <p className={styles.matchId}>Match: {matchId.slice(0, 8)}...</p>
        </div>

        <div className={styles.waitingState}>
          <div className={styles.spinner}></div>
          <h2 className={styles.waitingTitle}>
            {opponentLocked ? 'Opponent Ready! 🎉' : 'Commitment Submitted'}
          </h2>
          <p className={styles.waitingMessage}>
            {opponentLocked
              ? 'Both players have committed. The round will reveal shortly.'
              : 'Waiting for opponent to make their selection...'}
          </p>

          <div className={styles.opponentStatus}>
            <div className={`${styles.opponentBadge} ${opponentLocked ? styles.ready : styles.waiting}`}>
              {opponentLocked ? '✓' : '⏳'} Opponent
            </div>
            <div className={`${styles.opponentBadge} ${styles.ready}`}>
              ✓ You (committed)
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Selection UI
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.roundInfo}>
          <span className={styles.roundLabel}>Round</span>
          <span className={styles.roundNumber}>{roundNumber}</span>
          <span className={styles.roundLabel}>/ 3</span>
        </div>
        <p className={styles.matchId}>Match: {matchId.slice(0, 8)}...</p>
      </div>

      {/* Timer */}
      <TimerBar
        duration={TIMER_DURATION}
        isRunning={timerRunning && !timerComplete}
        onComplete={handleTimerComplete}
      />

      {/* Selection Summary */}
      <div className={styles.selectionSummary}>
        <div className={`${styles.selectionItem} ${choices.position ? styles.active : ''}`}>
          <span className={styles.selectionLabel}>Your Chair</span>
          <span className={`${styles.selectionValue} ${styles.chair}`}>
            {choices.position ? `⭐ ${choices.position}` : '—'}
          </span>
        </div>
        <div className={`${styles.selectionItem} ${choices.traps.length > 0 ? styles.active : ''}`}>
          <span className={styles.selectionLabel}>Traps</span>
          <span className={`${styles.selectionValue} ${styles.traps}`}>
            {choices.traps.length > 0
              ? choices.traps.map((t) => `💣${t}`).join(' ')
              : `${3 - choices.traps.length} left`}
          </span>
        </div>
      </div>

      {/* Chair Grid */}
      <div className={styles.gameArea}>
        <ChairGrid
          choices={choices}
          onSelectChair={handleSelectChair}
          onToggleTrap={handleToggleTrap}
          disabled={isLocked || isSubmitting}
          revealMode={false}
        />
      </div>

      {/* Error display */}
      {error && (
        <div className={styles.errorMessage}>
          {error}
          <button className={styles.retryButton} onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Lock In Button */}
      <button
        className={`${styles.lockInButton} ${
          isSubmitting
            ? styles.loading
            : isValid
            ? styles.enabled
            : styles.disabled
        }`}
        onClick={handleLockIn}
        disabled={!isValid || isSubmitting}
      >
        {isSubmitting
          ? 'Submitting...'
          : isValid
          ? '🔒 Lock In'
          : `Select chair + ${3 - choices.traps.length} trap${3 - choices.traps.length !== 1 ? 's' : ''}`}
      </button>
    </div>
  );
}

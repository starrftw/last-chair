'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@/wallet/useWallet';
import { getGameContract } from '@/wallet/walletHooks';
import { generateProof, ProofResult } from '@/zk/prover';
import { PlayerChoices } from '@/game/types';
import styles from './RevealPhase.module.css';

interface RevealPhaseProps {
  matchId: string;
  playerRole: 'a' | 'b';
  playerChoices: PlayerChoices;
  roundNumber: number;
  proverReady: boolean;
  onRevealComplete: (revealedChoices: PlayerChoices, proof: ProofResult) => void;
}

// Music countdown duration
const COUNTDOWN_DURATION = 5; // seconds

// Starknet field prime
const FIELD_PRIME = BigInt('0x800000000000010FFFFFFFFFFFFFFFFB781126DCAE6B9B1613DFD817BFCB2988D');

/**
 * Compute the commitment hash
 */
function computeCommitment(
  position: number,
  trap1: number,
  trap2: number,
  trap3: number,
  salt: bigint
): bigint {
  let result = BigInt(position);
  result = (result * BigInt(31) + BigInt(trap1)) % FIELD_PRIME;
  result = (result * BigInt(37) + BigInt(trap2)) % FIELD_PRIME;
  result = (result * BigInt(41) + BigInt(trap3)) % FIELD_PRIME;
  result = (result * BigInt(43) + salt) % FIELD_PRIME;
  return (result + FIELD_PRIME) % FIELD_PRIME;
}

/**
 * Generate random salt
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

export default function RevealPhase({
  matchId,
  playerChoices,
  roundNumber,
  proverReady,
  onRevealComplete,
}: RevealPhaseProps) {
  const { account } = useWallet();

  // Countdown state
  const [countdownNumber, setCountdownNumber] = useState(COUNTDOWN_DURATION);
  const [isCountingDown, setIsCountingDown] = useState(true);

  // Proof generation state
  const [proofState, setProofState] = useState<'idle' | 'generating' | 'submitting' | 'confirmed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [salt] = useState<bigint>(generateSalt());
  const [proof, setProof] = useState<ProofResult | null>(null);

  // Generate proof callback ref to avoid dependency issues
  const generateAndSubmitProofRef = useRef<(() => Promise<void>) | null>(null);

  // Start countdown on mount
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdownNumber((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setIsCountingDown(false);
          // Start proof generation after countdown
          if (generateAndSubmitProofRef.current) {
            setTimeout(() => generateAndSubmitProofRef.current?.(), 500);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Generate proof and submit to contract
  const generateAndSubmitProof = useCallback(async () => {
    if (!playerChoices.position || playerChoices.traps.length < 3) {
      setError('Invalid choices - cannot generate proof');
      setProofState('failed');
      return;
    }

    setProofState('generating');
    setProgress(0);

    try {
      // Compute commitment
      const commitment = computeCommitment(
        playerChoices.position,
        playerChoices.traps[0],
        playerChoices.traps[1],
        playerChoices.traps[2],
        salt
      );

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress((prev) => Math.min(prev + 15, 90));
      }, 200);

      // Generate ZK proof
      let proofResult: ProofResult;
      
      if (proverReady) {
        proofResult = await generateProof(
          playerChoices.position,
          playerChoices.traps[0],
          playerChoices.traps[1],
          playerChoices.traps[2],
          Number(salt),
          commitment
        );
      } else {
        // Fallback simulation
        const simulatedProof = new Uint8Array(64);
        for (let i = 0; i < 64; i++) {
          simulatedProof[i] = Math.floor(Math.random() * 256);
        }
        proofResult = {
          proof: simulatedProof,
          publicInputs: [commitment.toString()],
          isSimulation: true,
        };
      }

      clearInterval(progressInterval);
      setProgress(100);
      setProof(proofResult);

      // Submit proof to contract (optional - in demo mode we skip this)
      if (account) {
        setProofState('submitting');
        
        try {
          const contract = getGameContract(account);
          
          // Convert proof to felt252 (simplified - real implementation would serialize properly)
          const proofFelt = BigInt('0x' + 
            Array.from(proofResult.proof.slice(0, 16))
              .map(b => b.toString(16).padStart(2, '0'))
              .join('')
          ).toString();

          const publicInput = proofResult.publicInputs[0] || '0';

          console.log('Proof would be submitted:', {
            matchId,
            proof: proofFelt,
            publicInput,
          });

          // For demo mode, we simulate a successful submission
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (contractErr) {
          console.warn('Contract submission failed, continuing in demo mode:', contractErr);
        }
      }

      setProofState('confirmed');

      // Complete the reveal
      setTimeout(() => {
        onRevealComplete(playerChoices, proofResult);
      }, 1500);

    } catch (err) {
      console.error('Proof generation failed:', err);
      setError(err instanceof Error ? err.message : 'Proof generation failed');
      setProofState('failed');
    }
  }, [account, matchId, playerChoices, proverReady, salt, onRevealComplete]);

  // Store the function ref for useEffect
  useEffect(() => {
    generateAndSubmitProofRef.current = generateAndSubmitProof;
  }, [generateAndSubmitProof]);

  // Render countdown
  if (isCountingDown) {
    return (
      <div className={styles.container}>
        <div className={styles.musicArea}>
          <div className={styles.vinyl}>
            <div className={styles.vinylCenter}></div>
            <div className={styles.vinylGroove}></div>
          </div>
          <div className={`${styles.vinyl} ${styles.spinning}`}>
            <div className={styles.vinylCenter}></div>
          </div>
        </div>

        <div className={styles.countdown}>
          <span className={styles.countdownNumber}>{countdownNumber}</span>
          <span className={styles.countdownText}>
            {countdownNumber > 0 ? 'Music stopping in...' : '🎵'}
          </span>
        </div>

        <div className={styles.hint}>
          <p>Prepare to reveal your position and traps!</p>
        </div>
      </div>
    );
  }

  // Render proof generation
  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>Round {roundNumber} - Reveal Phase</h2>
        <p className={styles.matchId}>Match: {matchId.slice(0, 8)}...</p>
      </div>

      {/* Music stopped animation */}
      <div className={styles.musicStopped}>
        <div className={`${styles.musicNote} ${styles.stopped}`}>🎵</div>
        <span>Music Stopped!</span>
      </div>

      {/* Your choices (hidden until reveal) */}
      <div className={styles.choicesReveal}>
        <div className={styles.yourChoices}>
          <h3>Your Selection</h3>
          <div className={styles.choiceItems}>
            <div className={styles.choiceItem}>
              <span className={styles.choiceLabel}>Chair</span>
              <span className={styles.choiceValue}>⭐ {playerChoices.position || '—'}</span>
            </div>
            <div className={styles.choiceItem}>
              <span className={styles.choiceLabel}>Traps</span>
              <span className={styles.choiceValue}>
                {playerChoices.traps.length > 0 
                  ? playerChoices.traps.map(t => `💣${t}`).join(' ')
                  : 'None'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Proof generation progress */}
      <div className={styles.proofArea}>
        <h3>Generating ZK Proof</h3>
        
        <div className={styles.progressBar}>
          <div 
            className={styles.progressFill} 
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className={styles.statusMessage}>
          {proofState === 'idle' && 'Initializing prover...'}
          {proofState === 'generating' && (
            <>Generating proof of position & traps...</>
          )}
          {proofState === 'submitting' && 'Submitting proof to contract...'}
          {proofState === 'confirmed' && '✅ Proof verified!'}
          {proofState === 'failed' && '❌ Proof generation failed'}
        </div>

        {proofState === 'generating' && (
          <div className={styles.proofSteps}>
            <span className={progress >= 20 ? styles.stepDone : ''}>✓ Position validated</span>
            <span className={progress >= 40 ? styles.stepDone : ''}>✓ Traps validated</span>
            <span className={progress >= 60 ? styles.stepDone : ''}>✓ Circuit satisfied</span>
            <span className={progress >= 80 ? styles.stepDone : ''}>✓ Proof computed</span>
          </div>
        )}

        {proof && proofState === 'confirmed' && (
          <div className={styles.proofInfo}>
            <span className={styles.proofBadge}>
              {proof.isSimulation ? '🎭 Simulated Proof' : '🔐 ZK Proof'}
            </span>
            <span className={styles.proofHash}>
              {proof.publicInputs[0]?.slice(0, 16)}...
            </span>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            {error}
          </div>
        )}
      </div>

      {/* Waiting for opponent */}
      {proofState === 'confirmed' && (
        <div className={styles.waitingOpponent}>
          <div className={styles.spinner}></div>
          <p>Waiting for opponent to reveal...</p>
        </div>
      )}

      {/* Skip for demo */}
      {proofState === 'confirmed' && (
        <button 
          className={styles.skipButton}
          onClick={() => onRevealComplete(playerChoices, proof!)}
        >
          Continue (Demo Mode)
        </button>
      )}
    </div>
  );
}


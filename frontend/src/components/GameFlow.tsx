'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@/wallet/useWallet';
import { getGameContract, CONTRACT_ADDRESSES } from '@/wallet/walletHooks';
import { ProofResult, initializeProver } from '@/zk/prover';
import { PlayerChoices, RoundResult, ChairPosition } from '@/game/types';
import { resolveRound, settleMatch, getCurrentSplit } from '@/game/gameEngine';
import ChairSelection from './ChairSelection';
import RevealPhase from './RevealPhase';
import RoundResultView from './RoundResult';
import MatchResult from './MatchResult';
import styles from './GameFlow.module.css';

// Game phases
export type GamePhase =
  | 'lobby'
  | 'chair_selection'
  | 'waiting_commitment'
  | 'reveal'
  | 'round_result'
  | 'match_result';

interface GameFlowProps {
  initialMatchId?: string;
}

const DEFAULT_BET_AMOUNT = '10'; // STRK in wei (10 = 10 STRK)

export default function GameFlow({ initialMatchId }: GameFlowProps) {
  const { account, isConnected, isSepolia } = useWallet();

  // Game state
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [matchId, setMatchId] = useState<string>(initialMatchId || '');
  const [playerRole, setPlayerRole] = useState<'a' | 'b' | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [potAmount] = useState(10); // STRK

  // Player choices
  const [playerChoices, setPlayerChoices] = useState<PlayerChoices>({
    position: null,
    traps: [],
  });

  // Opponent state
  const [opponentLocked, setOpponentLocked] = useState(false);

  // Loading and error states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Proof state
  const [proofResult, setProofResult] = useState<ProofResult | null>(null);

  // Prover initialization
  const [proverReady, setProverReady] = useState(false);

  // Polling interval ref
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize ZK prover on mount
  useEffect(() => {
    const initProver = async () => {
      try {
        await initializeProver();
        setProverReady(true);
      } catch (err) {
        console.warn('Prover initialization failed, using simulation:', err);
        setProverReady(true);
      }
    };
    initProver();
  }, []);

  // Check opponent commitment on contract
  const checkOpponentCommitment = useCallback(async () => {
    if (!account || !matchId) return;

    try {
      const contract = getGameContract(wallet?.account);
      const matchData = await contract.get_match(matchId);

      // matchData is tuple: (player_a, player_b, bet_amount, round_number, score_a, score_b)
      const [, , , roundNumber] = matchData;

      // If round number has incremented past current round, opponent has committed
      if (Number(roundNumber) > currentRound) {
        setOpponentLocked(true);
      }
    } catch (err) {
      console.error('Error checking opponent commitment:', err);
    }
  }, [account, matchId, currentRound]);

  // Poll for opponent commitment
  useEffect(() => {
    if (phase === 'waiting_commitment' && matchId) {
      pollRef.current = setInterval(async () => {
        await checkOpponentCommitment();
      }, 3000);

      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [phase, matchId, checkOpponentCommitment]);

  // ── Contract Actions ──

  // At top of component, get wallet from context
  const { wallet } = useWallet();

  const handleCreateMatch = useCallback(async () => {
    if (!wallet?.account) {
      setError('Wallet not connected');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const contract = getGameContract(wallet.account);
      const tx = await contract.create_match(DEFAULT_BET_AMOUNT.toString());
      console.log('Create match tx:', tx);
      const newMatchId = Date.now().toString(); // temp until we parse events
      setMatchId(newMatchId);
      setPlayerRole('a');
      setPhase('chair_selection');
    } catch (err) {
      console.error('Failed to create match:', err);
      setError(err instanceof Error ? err.message : 'Failed to create match');
    } finally {
      setIsLoading(false);
    }
  }, [wallet]);

  const handleJoinMatch = useCallback(async (inputMatchId: string) => {
    if (!account) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const contract = getGameContract(wallet?.account);
      const matchIdFelt = BigInt(inputMatchId).toString();

      const tx = await contract.join_match(matchIdFelt);
      console.log('Join match tx:', tx);

      setMatchId(inputMatchId);
      setPlayerRole('b');
      setPhase('chair_selection');
    } catch (err) {
      console.error('Failed to join match:', err);
      setError(err instanceof Error ? err.message : 'Failed to join match. Make sure the match exists.');
    } finally {
      setIsLoading(false);
    }
  }, [account]);

  // Handle commitment submission
  const handleCommitmentSubmitted = useCallback(async () => {
    if (!account || !matchId || !playerChoices.position) return;

    setPhase('waiting_commitment');

    // In a real game, the opponent would also commit via their own wallet
    // For demo, we simulate by checking contract after a delay
    setOpponentLocked(true);

    // Short delay then move to reveal
    setTimeout(() => {
      setPhase('reveal');
    }, 2000);
  }, [account, matchId, playerChoices]);

  // Handle timer expired (auto-submit)
  const handleTimerExpired = useCallback(() => {
    if (playerChoices.position && playerChoices.traps.length === 3) {
      handleCommitmentSubmitted();
    }
  }, [playerChoices, handleCommitmentSubmitted]);

  // Handle reveal phase complete
  const handleRevealComplete = useCallback(async (
    revealedChoices: PlayerChoices,
    proof: ProofResult
  ) => {
    setProofResult(proof);
    resolveRoundLocally(revealedChoices);
  }, []);

  // Generate random traps for opponent
  const generateOpponentTraps = (): ChairPosition[] => {
    const traps: ChairPosition[] = [];
    while (traps.length < 3) {
      const randomChair = (Math.floor(Math.random() * 12) + 1) as ChairPosition;
      if (!traps.includes(randomChair)) {
        traps.push(randomChair);
      }
    }
    return traps;
  };

  // Generate random position for opponent
  const generateOpponentPosition = (traps: ChairPosition[]): ChairPosition => {
    let position: ChairPosition;
    do {
      position = (Math.floor(Math.random() * 12) + 1) as ChairPosition;
    } while (traps.includes(position));
    return position;
  };

  // Resolve round locally (demo mode)
  const resolveRoundLocally = useCallback(async (opponentChoicesParam?: PlayerChoices) => {
    // Generate opponent choices if not provided (demo mode)
    let oppChoices: PlayerChoices;

    if (opponentChoicesParam) {
      oppChoices = opponentChoicesParam;
    } else {
      const traps = generateOpponentTraps();
      const position = generateOpponentPosition(traps);
      oppChoices = { position, traps };
    }

    // If player is A, their choices go to playerA
    // If player is B, their choices go to playerB, and we generate A's choices
    const playerAChoices = playerRole === 'a' ? playerChoices : oppChoices;
    const playerBChoices = playerRole === 'b' ? playerChoices : oppChoices;

    const result = resolveRound(playerAChoices, playerBChoices);

    // Add opponent's actual traps to result for display
    const displayResult: RoundResult = {
      ...result,
      playerAChoices,
      playerBChoices,
    };

    setRoundResults(prev => [...prev, displayResult]);
    setPhase('round_result');
  }, [playerChoices, playerRole]);

  // Continue to next round or end match
  const handleRoundContinue = useCallback(() => {
    if (currentRound >= 3) {
      // Settle match - results are shown in MatchResult component
      setPhase('match_result');
    } else {
      // Advance to next round
      setCurrentRound(prev => prev + 1);
      setPlayerChoices({ position: null, traps: [] });
      setOpponentLocked(false);
      setProofResult(null);
      setPhase('chair_selection');
    }
  }, [currentRound]);

  // Play again - reset to lobby
  const handlePlayAgain = useCallback(() => {
    setPhase('lobby');
    setMatchId('');
    setPlayerRole(null);
    setCurrentRound(1);
    setRoundResults([]);
    setPlayerChoices({ position: null, traps: [] });
    setOpponentLocked(false);
    setProofResult(null);
  }, []);

  // ── Render Methods ──

  // Render lobby
  if (phase === 'lobby') {
    return (
      <div className={styles.lobbyContainer}>
        <div className={styles.lobbyHeader}>
          <h1 className={styles.title}>🎵 Last Chair</h1>
          <p className={styles.subtitle}>ZK Musical Chairs on Starknet</p>
        </div>

        {!isConnected ? (
          <div className={styles.connectPrompt}>
            <p>Connect your wallet to play</p>
          </div>
        ) : !isSepolia ? (
          <div className={styles.networkPrompt}>
            <p>Please switch to Starknet Sepolia</p>
          </div>
        ) : (
          <div className={styles.gameOptions}>
            <button
              className={styles.createButton}
              onClick={handleCreateMatch}
              disabled={isLoading}
            >
              {isLoading ? 'Creating...' : '🎮 Create Match'}
              <span className={styles.betAmount}>{DEFAULT_BET_AMOUNT} STRK</span>
            </button>

            <div className={styles.divider}>OR</div>

            <div className={styles.joinSection}>
              <input
                type="text"
                className={styles.matchInput}
                placeholder="Enter match ID..."
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
              />
              <button
                className={styles.joinButton}
                onClick={() => handleJoinMatch(matchId)}
                disabled={isLoading || !matchId}
              >
                {isLoading ? 'Joining...' : '🔗 Join Match'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)}>Dismiss</button>
          </div>
        )}

        <div className={styles.contractInfo}>
          <p>Game Contract: {CONTRACT_ADDRESSES.GAME.slice(0, 10)}...</p>
          <p>Network: Starknet Sepolia</p>
        </div>
      </div>
    );
  }

  // Render chair selection
  if (phase === 'chair_selection') {
    return (
      <div className={styles.gameContainer}>
        <ChairSelection
          matchId={matchId}
          roundNumber={currentRound}
          playerRole={playerRole!}
          opponentLocked={opponentLocked}
          onCommitmentSubmitted={handleCommitmentSubmitted}
          onTimerExpired={handleTimerExpired}
        />
      </div>
    );
  }

  // Render waiting for commitment
  if (phase === 'waiting_commitment') {
    return (
      <div className={styles.waitingContainer}>
        <div className={styles.spinner}></div>
        <h2>Waiting for Opponent</h2>
        <p>Match ID: {matchId.slice(0, 8)}...</p>
        <p>Round {currentRound}/3</p>

        <div className={styles.statusBadges}>
          <span className={styles.myBadge}>✓ You committed</span>
          <span className={`${styles.opponentBadge} ${opponentLocked ? styles.ready : ''}`}>
            {opponentLocked ? '✓' : '⏳'} Opponent
          </span>
        </div>
      </div>
    );
  }

  // Render reveal phase
  if (phase === 'reveal') {
    return (
      <RevealPhase
        matchId={matchId}
        playerRole={playerRole!}
        playerChoices={playerChoices}
        roundNumber={currentRound}
        proverReady={proverReady}
        onRevealComplete={handleRevealComplete}
      />
    );
  }

  // Render round result
  if (phase === 'round_result') {
    const latestResult = roundResults[roundResults.length - 1];

    return (
      <RoundResultView
        roundNumber={currentRound}
        result={latestResult}
        allResults={roundResults}
        potAmount={potAmount}
        onContinue={handleRoundContinue}
        isFinalRound={currentRound >= 3}
      />
    );
  }

  // Render match result
  if (phase === 'match_result') {
    const finalSplit = settleMatch(roundResults);

    return (
      <MatchResult
        roundResults={roundResults}
        finalSplit={finalSplit}
        potAmount={potAmount}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  // Fallback
  return (
    <div className={styles.loading}>
      <div className={styles.spinner}></div>
      <p>Loading game...</p>
    </div>
  );
}

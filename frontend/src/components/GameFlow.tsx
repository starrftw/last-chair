'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useWallet } from '@/wallet/useWallet';
import {
  approveAndStartMatch,
  submitReveal,
  settleRound,
  settleMatch,
  getMatchData,
  getRoundData,
  computeCommitments,
  getContractAddresses,
} from '@/wallet/walletHooks';
import { initializeProver, generateProof } from '@/zk/prover';
import ChairSelection from './ChairSelection';
import styles from './GameFlow.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────

export type GamePhase =
  | 'lobby'         // wallet connected, loadout + stake selection
  | 'searching'     // waiting for opponent match via relay
  | 'starting'      // both matched, signing start_match tx
  | 'round_active'  // 20s timer running
  | 'revealing'     // generating + submitting ZK proof
  | 'round_result'  // scores shown, next round countdown
  | 'match_result'; // final split + payout

export interface Loadout {
  chair: number;       // 1-12
  trap1: number;
  trap2: number;
  trap3: number;
}

export interface RoundScore {
  round: number;
  scoreA: number;   // scaled x4
  scoreB: number;
  chairA: number;
  chairB: number;
  trappedA: boolean;
  trappedB: boolean;
}

// STRK amounts in wei (18 decimals)
const STAKE_OPTIONS = [
  { label: '1 STRK', value: (1n * 10n ** 18n).toString() },
  { label: '5 STRK', value: (5n * 10n ** 18n).toString() },
  { label: '10 STRK', value: (10n * 10n ** 18n).toString() },
];

const DEFAULT_LOADOUT: Loadout = { chair: 6, trap1: 2, trap2: 7, trap3: 11 };
const ROUND_TIMER_SECONDS = 20;

// ─── Component ───────────────────────────────────────────────────────────────

export default function GameFlow() {
  const { wallet, provider, chainId, isConnected, isSepolia } = useWallet();

  // ── Match state
  const [phase, setPhase] = useState<GamePhase>('lobby');
  const [matchId, setMatchId] = useState<string>('');
  const [playerRole, setPlayerRole] = useState<'a' | 'b' | null>(null);
  const [currentRound, setCurrentRound] = useState(1);
  const [roundScores, setRoundScores] = useState<RoundScore[]>([]);

  // ── Loadout + stake
  const [loadout, setLoadout] = useState<Loadout>(DEFAULT_LOADOUT);
  const [stakeWei, setStakeWei] = useState(STAKE_OPTIONS[0].value);

  // ── Commitments (computed once at match start, for all 3 rounds)
  const [salts, setSalts] = useState<bigint[]>([]);
  const [commitments, setCommitments] = useState<[string, string, string] | null>(null);

  // ── UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [proverReady, setProverReady] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  // ── Polling
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Init prover on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    initializeProver()
      .then(() => setProverReady(true))
      .catch(e => { console.warn('Prover init failed:', e); setProverReady(true); });
  }, []);

  // ─── Cleanup polling on unmount
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ─── Generate salts + commitments from loadout
  // Called once when match is confirmed — covers all 3 rounds
  const buildCommitments = useCallback((l: Loadout): { salts: bigint[], commits: [string, string, string] } => {
    const newSalts = [0, 1, 2].map(() => BigInt(Math.floor(Math.random() * 1e15)));
    const rounds = newSalts.map(salt => ({
      chair: l.chair, trap1: l.trap1, trap2: l.trap2, trap3: l.trap3, salt,
    }));
    const commits = computeCommitments(rounds, (inputs) => {
      // Real pedersen computed in prover — this is a placeholder commitment
      // Actual value sent to chain comes from generateProof output
      const seed = inputs.reduce((acc, v) => acc + BigInt(v), 0n);
      return ('0x' + seed.toString(16).padStart(62, '0'));
    });
    return { salts: newSalts, commits };
  }, []);

  // ─── PLAY button — enter matchmaking queue
  const handlePlay = useCallback(async () => {
    if (!wallet?.account || !chainId) { setError('Wallet not connected'); return; }
    setIsLoading(true);
    setError(null);
    setPhase('searching');
    setStatusMsg('Finding opponent...');

    try {
      // Generate commitments for all 3 rounds from current loadout
      const { salts: newSalts, commits } = buildCommitments(loadout);
      setSalts(newSalts);
      setCommitments(commits);

      // Notify off-chain relay we want a match
      // Relay returns match_id + opponent address when matched
      const matchedId = await waitForMatch(stakeWei, chainId);
      setMatchId(matchedId);

      // Both players sign approve + start_match in one tx
      setStatusMsg('Confirm transaction to lock stake...');
      setPhase('starting');

      const tx = await approveAndStartMatch(
        wallet.account, chainId, matchedId, stakeWei,
        commits[0], commits[1], commits[2]
      );
      console.log('start_match tx:', tx.transaction_hash);

      // Determine player role from relay response (set during waitForMatch)
      // For now set by relay — TODO: relay must tell us a/b
      setPlayerRole('a'); // relay will set this correctly
      setCurrentRound(1);
      setRoundScores([]);
      setPhase('round_active');
      setStatusMsg('');
    } catch (err) {
      console.error('Failed to start match:', err);
      setError(err instanceof Error ? err.message : 'Failed to start match');
      setPhase('lobby');
    } finally {
      setIsLoading(false);
    }
  }, [wallet, chainId, loadout, stakeWei, buildCommitments]);

  // ─── Round timer expired — auto-commit current loadout selection
  const handleRoundEnd = useCallback(async (finalLoadout: Loadout) => {
    if (!wallet?.account || !chainId || !matchId || !commitments || !salts.length) return;

    setPhase('revealing');
    setStatusMsg('Encrypting your moves...');

    try {
      // If player changed loadout during the round, we need to recompute
      // BUT: the commitment was already sent to chain at match start
      // So we always reveal with the ORIGINAL loadout for this round
      // (the ZK proof verifies it matches the stored commitment)
      const roundIndex = currentRound - 1;
      const salt = salts[roundIndex];

      // Generate ZK proof
      setStatusMsg('Generating proof...');
      const proof = await generateProof({
        chair: loadout.chair,
        trap1: loadout.trap1,
        trap2: loadout.trap2,
        trap3: loadout.trap3,
        salt,
        commitment: BigInt(commitments[roundIndex]),
      });

      // Submit reveal (proof + revealed values appended)
      setStatusMsg('Submitting to chain...');
      const proofWithHints = [
        ...proof.proofFelts,
        loadout.chair.toString(),
        loadout.trap1.toString(),
        loadout.trap2.toString(),
        loadout.trap3.toString(),
      ];
      await submitReveal(wallet.account, chainId, matchId, currentRound, proofWithHints);

      // Poll until opponent reveals too, then settle
      setStatusMsg('Waiting for opponent reveal...');
      await pollUntilBothRevealed(matchId, currentRound);

      // Settle round — callable by anyone
      await settleRound(wallet.account, chainId, matchId, currentRound);

      // Read results from chain
      const roundData = await getRoundData(provider!, chainId, matchId, currentRound) as any;
      const score: RoundScore = {
        round: currentRound,
        scoreA: Number(roundData.score_a),
        scoreB: Number(roundData.score_b),
        chairA: Number(roundData.chair_a),
        chairB: Number(roundData.chair_b),
        trappedA: isTrapped(Number(roundData.chair_a), Number(roundData.trap1_b), Number(roundData.trap2_b), Number(roundData.trap3_b)),
        trappedB: isTrapped(Number(roundData.chair_b), Number(roundData.trap1_a), Number(roundData.trap2_a), Number(roundData.trap3_a)),
      };
      setRoundScores(prev => [...prev, score]);
      setPhase('round_result');
      setStatusMsg('');

    } catch (err) {
      console.error('Round reveal failed:', err);
      setError(err instanceof Error ? err.message : 'Round failed');
      setPhase('round_result'); // still show result screen
    }
  }, [wallet, chainId, matchId, commitments, salts, currentRound, loadout, provider]);

  // ─── Continue to next round or end match
  const handleRoundContinue = useCallback(async () => {
    if (currentRound >= 3) {
      // Settle match on chain
      try {
        await settleMatch(wallet!.account, chainId!, matchId);
      } catch (err) {
        console.error('settle_match failed:', err);
      }
      setPhase('match_result');
    } else {
      setCurrentRound(r => r + 1);
      setPhase('round_active');
    }
  }, [currentRound, wallet, chainId, matchId]);

  // ─── Auto-queue after match
  const handlePlayAgain = useCallback(() => {
    setPhase('lobby');
    setMatchId('');
    setPlayerRole(null);
    setCurrentRound(1);
    setRoundScores([]);
    setCommitments(null);
    setSalts([]);
    setError(null);
  }, []);

  // ─── Cumulative split helper
  const getCumulativeSplit = () => {
    const totalA = roundScores.reduce((s, r) => s + r.scoreA, 0);
    const totalB = roundScores.reduce((s, r) => s + r.scoreB, 0);
    const total = totalA + totalB;
    if (total === 0) return { pctA: 50, pctB: 50 };
    return { pctA: Math.round((totalA / total) * 100), pctB: Math.round((totalB / total) * 100) };
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  // LOBBY
  if (phase === 'lobby') {
    return (
      <div className={styles.lobby}>
        {!isConnected ? (
          <div className={styles.connectPrompt}>
            <p>Connect wallet to play</p>
          </div>
        ) : !isSepolia ? (
          <div className={styles.networkPrompt}>
            <p>Switch to Starknet Sepolia</p>
          </div>
        ) : (
          <>
            {/* Loadout selector */}
            <LoadoutSelector loadout={loadout} onChange={setLoadout} />

            {/* Stake selector */}
            <div className={styles.stakeSelector}>
              {STAKE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  className={`${styles.stakeBtn} ${stakeWei === opt.value ? styles.selected : ''}`}
                  onClick={() => setStakeWei(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              className={styles.playButton}
              onClick={handlePlay}
              disabled={isLoading || !proverReady}
            >
              {isLoading ? 'Finding match...' : 'PLAY'}
            </button>
          </>
        )}

        {error && (
          <div className={styles.error}>
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        <div className={styles.contractInfo}>
          <span>{getContractAddresses(chainId ?? 'SN_SEPOLIA').game.slice(0, 10)}...</span>
          <span>Sepolia</span>
        </div>
      </div>
    );
  }

  // SEARCHING / STARTING
  if (phase === 'searching' || phase === 'starting') {
    return (
      <div className={styles.searching}>
        <div className={styles.spinner} />
        <p>{statusMsg}</p>
        {phase === 'searching' && (
          <button className={styles.cancelBtn} onClick={handlePlayAgain}>Cancel</button>
        )}
      </div>
    );
  }

  // ROUND ACTIVE
  if (phase === 'round_active' || phase === 'revealing') {
    const split = getCumulativeSplit();
    return (
      <ChairSelection
        matchId={matchId}
        roundNumber={currentRound}
        playerRole={playerRole!}
        loadout={loadout}
        onLoadoutChange={setLoadout}
        onRoundEnd={handleRoundEnd}
        timerSeconds={ROUND_TIMER_SECONDS}
        isRevealing={phase === 'revealing'}
        revealStatus={statusMsg}
        splitA={split.pctA}
        splitB={split.pctB}
      />
    );
  }

  // ROUND RESULT
  if (phase === 'round_result') {
    const latest = roundScores[roundScores.length - 1];
    const split = getCumulativeSplit();
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <h2>Round {currentRound} / 3</h2>
        <p>Your chair: {latest?.chairA} {latest?.trappedA ? '☠️ TRAPPED' : '✅ Safe'}</p>
        <p>Their chair: {latest?.chairB} {latest?.trappedB ? '☠️ TRAPPED' : '✅ Safe'}</p>
        <p>Split: {split.pctA}% / {split.pctB}%</p>
        <button onClick={handleRoundContinue} style={{ marginTop: 16, padding: '8px 24px' }}>
          {currentRound >= 3 ? 'See Final Result →' : 'Next Round →'}
        </button>
      </div>
    );
  }
  // MATCH RESULT
  if (phase === 'match_result') {
    const split = getCumulativeSplit();
    const won = (playerRole === 'a' ? split.pctA : split.pctB) > 50;
    const stakeNum = Number(BigInt(stakeWei) / 10n ** 18n);
    return (
      <div style={{ padding: 32, textAlign: 'center' }}>
        <h1>{won ? '🏆 You Win!' : '💀 You Lose'}</h1>
        <p>Final split: {split.pctA}% / {split.pctB}%</p>
        <p>Pot: {stakeNum * 2} STRK</p>
        {roundScores.map(r => (
          <p key={r.round}>R{r.round}: {r.scoreA} vs {r.scoreB}</p>
        ))}
        <button onClick={handlePlayAgain} style={{ marginTop: 16, padding: '8px 24px' }}>
          Play Again
        </button>
      </div>
    );
  }

  // ─── Inline sub-components (placeholder until you build them out) ─────────────

  function LoadoutSelector({ loadout, onChange }: { loadout: Loadout; onChange: (l: Loadout) => void }) {
    const PRESETS = [
      { name: '🕺 Safety Dance', chair: 2, trap1: 6, trap2: 7, trap3: 8 },
      { name: '🔥 Hot Potato', chair: 11, trap1: 2, trap2: 3, trap3: 4 },
      { name: '🌀 Dizzy Rascal', chair: 6, trap1: 1, trap2: 9, trap3: 12 },
      { name: '🐍 Snake Eyes', chair: 9, trap1: 3, trap2: 5, trap3: 6 },
      { name: '🎭 Masquerade', chair: 4, trap1: 8, trap2: 9, trap3: 11 },
    ];

    return (
      <div>
        {PRESETS.map(p => (
          <button
            key={p.name}
            onClick={() => onChange({ chair: p.chair, trap1: p.trap1, trap2: p.trap2, trap3: p.trap3 })}
            style={{ fontWeight: loadout.chair === p.chair ? 'bold' : 'normal', margin: 4 }}
          >
            {p.name}
          </button>
        ))}
      </div>
    );
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  function isTrapped(pos: number, t1: number, t2: number, t3: number): boolean {
    return pos === t1 || pos === t2 || pos === t3;
  }

  // Off-chain relay call — polls until opponent found, returns match_id
  async function waitForMatch(stakeWei: string, chainId: string): Promise<string> {
    // TODO: replace with real relay endpoint
    // Relay listens to QueueOpened events, pairs two players with same stake,
    // calls match_players(), returns match_id to both
    // For now — generate a match_id and simulate instant match
    await new Promise(r => setTimeout(r, 2000));
    return Math.floor(Math.random() * 1e10).toString();
  }

  // Poll contract until both players have revealed for a round
  async function pollUntilBothRevealed(matchId: string, round: number): Promise<void> {
    // TODO: poll getRoundData until round.state === Settled (both reveals in)
    // For now simulate with a delay
    await new Promise(r => setTimeout(r, 3000));
  }
}
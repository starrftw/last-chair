'use client';

import { RoundResult } from '../game/types';
import { formatPercent } from '../game/gameEngine';
import styles from './MatchResult.module.css';

interface MatchResultProps {
    roundResults: RoundResult[];
    finalSplit: { playerA: number; playerB: number };
    potAmount: number;
    onPlayAgain: () => void;
}

export default function MatchResult({
    roundResults,
    finalSplit,
    potAmount,
    onPlayAgain,
}: MatchResultProps) {
    const fee = potAmount * 0.01;
    const netPot = potAmount - fee;
    const payoutA = finalSplit.playerA * netPot;
    const payoutB = finalSplit.playerB * netPot;

    const winner =
        finalSplit.playerA > finalSplit.playerB ? 'Player 1'
            : finalSplit.playerB > finalSplit.playerA ? 'Player 2'
                : null;

    const hostReaction =
        winner === null ? '😐' // draw
            : finalSplit.playerA > 0.8 || finalSplit.playerB > 0.8 ? '🤯' // dominant
                : '👏';

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                <div className={styles.hostReaction}>
                    <span className={styles.hostEmoji}>{hostReaction}</span>
                    <span className={styles.hostLabel}>The Host</span>
                </div>

                <h1 className={styles.title}>
                    {winner ? `🏆 ${winner} Wins!` : '🤝 Dead Even Split!'}
                </h1>

                <div className={styles.splitBar}>
                    <div
                        className={styles.splitA}
                        style={{ width: `${finalSplit.playerA * 100}%` }}
                    >
                        🧑‍🎤 {formatPercent(finalSplit.playerA)}
                    </div>
                    <div
                        className={styles.splitB}
                        style={{ width: `${finalSplit.playerB * 100}%` }}
                    >
                        🧑‍🚀 {formatPercent(finalSplit.playerB)}
                    </div>
                </div>

                <div className={styles.payouts}>
                    <div className={styles.payoutCard}>
                        <span className={styles.payoutPlayer}>🧑‍🎤 Player 1</span>
                        <span className={styles.payoutAmount}>{payoutA.toFixed(2)} STRK</span>
                    </div>
                    <div className={styles.payoutCard}>
                        <span className={styles.payoutPlayer}>🧑‍🚀 Player 2</span>
                        <span className={styles.payoutAmount}>{payoutB.toFixed(2)} STRK</span>
                    </div>
                </div>

                <div className={styles.roundBreakdown}>
                    <h3>Round Breakdown</h3>
                    <table className={styles.table}>
                        <thead>
                            <tr>
                                <th>Round</th>
                                <th>P1 Chair</th>
                                <th>P2 Chair</th>
                                <th>Outcome</th>
                                <th>P1 Coeff</th>
                                <th>P2 Coeff</th>
                            </tr>
                        </thead>
                        <tbody>
                            {roundResults.map((r, i) => (
                                <tr key={i}>
                                    <td>{i + 1}</td>
                                    <td>⭐{r.playerAChoices.position}</td>
                                    <td>⭐{r.playerBChoices.position}</td>
                                    <td>
                                        {r.outcome === 'both_trapped' ? '💥 Both'
                                            : r.outcome === 'a_trapped' ? '☠️ P1'
                                                : r.outcome === 'b_trapped' ? '☠️ P2'
                                                    : '✅ Safe'}
                                    </td>
                                    <td className={styles.coeffCell}>{r.coefficients.playerA.toFixed(3)}</td>
                                    <td className={styles.coeffCell}>{r.coefficients.playerB.toFixed(3)}</td>
                                </tr>
                            ))}
                            <tr className={styles.totalRow}>
                                <td colSpan={4}>Total</td>
                                <td className={styles.coeffCell}>
                                    {roundResults.reduce((s, r) => s + r.coefficients.playerA, 0).toFixed(3)}
                                </td>
                                <td className={styles.coeffCell}>
                                    {roundResults.reduce((s, r) => s + r.coefficients.playerB, 0).toFixed(3)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className={styles.feeNote}>
                    💰 Protocol fee: {fee.toFixed(2)} STRK (1%)
                </div>

                <button className={styles.playAgain} onClick={onPlayAgain}>
                    🔄 Play Again
                </button>
            </div>
        </div>
    );
}

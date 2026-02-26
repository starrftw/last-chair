'use client';

import { RoundResult } from '../game/types';
import { getCurrentSplit, formatPercent } from '../game/gameEngine';
import styles from './RoundResult.module.css';

interface RoundResultViewProps {
    roundNumber: number;
    result: RoundResult;
    allResults: RoundResult[];
    potAmount: number;
    onContinue: () => void;
    isFinalRound: boolean;
}

export default function RoundResultView({
    roundNumber,
    result,
    allResults,
    potAmount,
    onContinue,
    isFinalRound,
}: RoundResultViewProps) {
    const split = getCurrentSplit(allResults);

    return (
        <div className={styles.overlay}>
            <div className={styles.card}>
                <h2 className={styles.roundLabel}>Round {roundNumber} Result</h2>

                <div className={styles.outcome}>
                    <span className={styles.outcomeEmoji}>
                        {result.outcome === 'both_trapped' ? '💥'
                            : result.outcome === 'a_trapped' ? '☠️'
                                : result.outcome === 'b_trapped' ? '☠️'
                                    : '✅'}
                    </span>
                    <p className={styles.outcomeText}>{result.description}</p>
                </div>

                <div className={styles.breakdown}>
                    <div className={styles.playerRow}>
                        <span>🧑‍🎤 Player 1</span>
                        <span>Chair {result.playerAChoices.position} → Risk {((result.playerAChoices.position! / 12) * 100).toFixed(0)}%</span>
                        <span className={styles.coeff}>+{result.coefficients.playerA.toFixed(3)}</span>
                    </div>
                    <div className={styles.playerRow}>
                        <span>🧑‍🚀 Player 2</span>
                        <span>Chair {result.playerBChoices.position} → Risk {((result.playerBChoices.position! / 12) * 100).toFixed(0)}%</span>
                        <span className={styles.coeff}>+{result.coefficients.playerB.toFixed(3)}</span>
                    </div>
                </div>

                <div className={styles.trapReveal}>
                    <div className={styles.trapRow}>
                        <span>P1 traps:</span>
                        <span>{result.playerAChoices.traps.map(t => `💣${t}`).join(' ')}</span>
                    </div>
                    <div className={styles.trapRow}>
                        <span>P2 traps:</span>
                        <span>{result.playerBChoices.traps.map(t => `💣${t}`).join(' ')}</span>
                    </div>
                </div>

                <div className={styles.splitPreview}>
                    <h3>Cumulative Split</h3>
                    <div className={styles.splitBar}>
                        <div
                            className={styles.splitA}
                            style={{ width: `${split.playerA * 100}%` }}
                        >
                            {formatPercent(split.playerA)}
                        </div>
                        <div
                            className={styles.splitB}
                            style={{ width: `${split.playerB * 100}%` }}
                        >
                            {formatPercent(split.playerB)}
                        </div>
                    </div>
                    <div className={styles.splitLabels}>
                        <span>🧑‍🎤 {(split.playerA * potAmount * 0.99).toFixed(2)} STRK</span>
                        <span>🧑‍🚀 {(split.playerB * potAmount * 0.99).toFixed(2)} STRK</span>
                    </div>
                </div>

                <button className={styles.continueBtn} onClick={onContinue}>
                    {isFinalRound ? '🏆 See Final Result' : `⏭️ Round ${roundNumber + 1}`}
                </button>
            </div>
        </div>
    );
}

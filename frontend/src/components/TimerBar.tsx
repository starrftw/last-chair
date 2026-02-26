'use client';

import { useEffect, useState } from 'react';
import styles from './TimerBar.module.css';

interface TimerBarProps {
    duration: number; // seconds
    isRunning: boolean;
    onComplete: () => void;
}

export default function TimerBar({ duration, isRunning, onComplete }: TimerBarProps) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!isRunning) {
            setElapsed(0);
            return;
        }

        const interval = setInterval(() => {
            setElapsed((prev) => {
                const next = prev + 0.05;
                if (next >= duration) {
                    clearInterval(interval);
                    onComplete();
                    return duration;
                }
                return next;
            });
        }, 50);

        return () => clearInterval(interval);
    }, [isRunning, duration, onComplete]);

    const progress = Math.min(elapsed / duration, 1);
    const remaining = Math.max(0, Math.ceil(duration - elapsed));

    const notes = ['🎵', '🎶', '♪', '♫'];

    return (
        <div className={styles.container}>
            <div className={styles.barTrack}>
                <div
                    className={styles.barFill}
                    style={{ width: `${progress * 100}%` }}
                />
                {isRunning && (
                    <div
                        className={styles.noteMarker}
                        style={{ left: `${progress * 100}%` }}
                    >
                        {notes[Math.floor(elapsed * 2) % notes.length]}
                    </div>
                )}
            </div>
            <div className={styles.timer}>
                <span className={`${styles.time} ${remaining <= 5 ? styles.urgent : ''}`}>
                    {remaining}s
                </span>
            </div>
        </div>
    );
}

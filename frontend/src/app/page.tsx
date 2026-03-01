"use client";

import Header from "@/components/Header";
import "./globals.css";
import styles from "./page.module.css";
import dynamic from 'next/dynamic';

const GameFlow = dynamic(() => import('@/components/GameFlow'), { ssr: false });

export default function Home() {
  return (
    <div className={styles.container}>
      <Header />
      <main className={styles.main}>
        <GameFlow />
      </main>
    </div>
  );
}

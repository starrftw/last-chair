"use client";

import Header from "@/components/Header";
import GameFlow from "@/components/GameFlow";
import "./globals.css";
import styles from "./page.module.css";

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

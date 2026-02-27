"use client";

import { useWallet } from "@/wallet/useWallet";
import styles from "./Header.module.css";

export default function Header() {
    const { isConnected, isConnecting, connect, disconnect, displayAddress, isSepolia } = useWallet();

    const handleConnect = async () => {
        try {
            await connect();
        } catch (error) {
            console.error("Failed to connect wallet:", error);
        }
    };

    const handleDisconnect = async () => {
        try {
            await disconnect();
        } catch (error) {
            console.error("Failed to disconnect wallet:", error);
        }
    };

    return (
        <header className={styles.header}>
            <div className={styles.logo}>
                <span className={styles.logoIcon}>🪑</span>
                <span className={styles.logoText}>Last Chair</span>
            </div>

            <div className={styles.walletSection}>
                {!isConnected ? (
                    <button
                        className={styles.connectButton}
                        onClick={handleConnect}
                        disabled={isConnecting}
                    >
                        {isConnecting ? "Connecting..." : "Connect Wallet"}
                    </button>
                ) : (
                    <div className={styles.connectedInfo}>
                        <div className={styles.addressBadge}>
                            <span className={styles.address}>{displayAddress}</span>
                            {!isSepolia && (
                                <span className={styles.wrongNetwork}>Wrong Network</span>
                            )}
                        </div>
                        <button
                            className={styles.disconnectButton}
                            onClick={handleDisconnect}
                        >
                            Disconnect
                        </button>
                    </div>
                )}
            </div>
        </header>
    );
}

"use client";

import { useState } from "react";
import { useWallet } from "@/wallet/useWallet";
import { getInstalledWallet, getWalletName, CONTRACT_ADDRESSES } from "@/wallet/walletHooks";
import styles from "./Lobby.module.css";

interface LobbyProps {
  onJoinMatch: (matchId: string) => void;
  onCreateMatch: () => void;
}

export default function Lobby({ onJoinMatch, onCreateMatch }: LobbyProps) {
  const { 
    isConnected, 
    isConnecting, 
    connect, 
    disconnect, 
    address, 
    displayAddress,
    chainId,
    isSepolia,
    switchToSepolia 
  } = useWallet();
  
  const [matchIdInput, setMatchIdInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const installedWallet = getInstalledWallet();

  const handleConnect = async () => {
    try {
      setError(null);
      await connect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet");
    }
  };

  const handleJoinMatch = () => {
    if (!matchIdInput.trim()) {
      setError("Please enter a match ID");
      return;
    }
    onJoinMatch(matchIdInput.trim());
  };

  const handleCreateMatch = () => {
    onCreateMatch();
  };

  // Not connected - show connect wallet screen
  if (!isConnected) {
    return (
      <div className={styles.lobby}>
        <div className={styles.logoSection}>
          <h1 className={styles.title}>🎵 Last Chair</h1>
          <p className={styles.subtitle}>ZK Musical Chairs on Starknet</p>
        </div>

        <div className={styles.connectSection}>
          <h2 className={styles.connectTitle}>Connect Your Wallet</h2>
          
          {installedWallet ? (
            <p className={styles.walletDetected}>
              Detected: {getWalletName(installedWallet)}
            </p>
          ) : (
            <div className={styles.noWallet}>
              <p>No wallet detected. Please install:</p>
              <ul className={styles.walletList}>
                <li><a href="https://www.argent.xyz/argent-x/" target="_blank" rel="noopener noreferrer">Argent X</a></li>
                <li><a href="https://braavos.xyz/" target="_blank" rel="noopener noreferrer">Braavos</a></li>
              </ul>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button 
            className={styles.connectButton}
            onClick={handleConnect}
            disabled={isConnecting || !installedWallet}
          >
            {isConnecting ? "Connecting..." : "Connect Wallet"}
          </button>
        </div>

        <div className={styles.infoSection}>
          <h3>How to Play</h3>
          <ol>
            <li>Connect your wallet (Sepolia testnet)</li>
            <li>Create a new match or join an existing one</li>
            <li>Pick your chair strategically</li>
            <li>Prove your wins with ZK proofs</li>
          </ol>
        </div>

        <div className={styles.contractInfo}>
          <p><strong>Game Contract:</strong> {CONTRACT_ADDRESSES.GAME.slice(0, 10)}...</p>
          <p><strong>Network:</strong> Starknet Sepolia</p>
        </div>
      </div>
    );
  }

  // Connected but wrong network
  if (!isSepolia) {
    return (
      <div className={styles.lobby}>
        <div className={styles.walletInfo}>
          <p>Connected: {displayAddress}</p>
          <button className={styles.disconnectButton} onClick={disconnect}>
            Disconnect
          </button>
        </div>

        <div className={styles.networkWarning}>
          <h2>Wrong Network</h2>
          <p>Please switch to Starknet Sepolia to play</p>
          <button className={styles.switchButton} onClick={switchToSepolia}>
            Switch to Sepolia
          </button>
        </div>
      </div>
    );
  }

  // Connected and on correct network - show game options
  return (
    <div className={styles.lobby}>
      <div className={styles.header}>
        <h1 className={styles.title}>🎵 Last Chair</h1>
        <div className={styles.walletInfo}>
          <span className={styles.address}>{displayAddress}</span>
          <span className={styles.network}>Sepolia ✓</span>
          <button className={styles.disconnectButton} onClick={disconnect}>
            Disconnect
          </button>
        </div>
      </div>

      <div className={styles.gameOptions}>
        <div className={styles.optionCard}>
          <h2>Create Match</h2>
          <p>Start a new game and wait for an opponent to join</p>
          <button className={styles.primaryButton} onClick={handleCreateMatch}>
            Create New Match
          </button>
        </div>

        <div className={styles.divider}>OR</div>

        <div className={styles.optionCard}>
          <h2>Join Match</h2>
          <p>Enter a match ID to join an existing game</p>
          <input
            type="text"
            className={styles.matchInput}
            placeholder="Enter match ID..."
            value={matchIdInput}
            onChange={(e) => setMatchIdInput(e.target.value)}
          />
          <button 
            className={styles.secondaryButton} 
            onClick={handleJoinMatch}
            disabled={!matchIdInput.trim()}
          >
            Join Match
          </button>
        </div>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.contractInfo}>
        <p><strong>Game:</strong> {CONTRACT_ADDRESSES.GAME}</p>
        <p><strong>Verifier:</strong> {CONTRACT_ADDRESSES.VERIFIER}</p>
      </div>
    </div>
  );
}

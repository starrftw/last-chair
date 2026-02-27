"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Account } from "starknet";
import { connect as connectWallet, disconnect as disconnectStarknet, StarknetWindowObject } from "get-starknet";

export const GAME_CONTRACT_ADDRESS = "0x00bf98bcca019014ea239db24ec63016b266df3e5e1041946147b66d9d9887eb";

// Extended wallet type after enable() is called
interface EnabledWallet {
  isConnected: boolean;
  account: Account;
  selectedAddress: string;
  chainId: string;
  request: (options: { method: string; params?: unknown[] | object }) => Promise<unknown>;
}

export interface WalletState {
  starknet: EnabledWallet | null;
  account: Account | null;
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: string | null;
}

interface WalletContextType extends WalletState {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [starknet, setStarknet] = useState<EnabledWallet | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<string | null>(null);

  // NO silent connect on mount — user connects when they want to

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      // get-starknet v4: connect() returns the wallet object
      const wallet = await connectWallet({
        modalMode: "alwaysAsk",
        modalTheme: "dark",
      });

      if (!wallet) {
        throw new Error("No wallet selected");
      }

      // Type assert to access enable method (get-starknet types are incomplete)
      const walletWithEnable = wallet as unknown as { enable: (options: { starknetVersion: string }) => Promise<{ [key: string]: unknown }> };
      
      // Enable the wallet to get accounts - this enhances the wallet object
      await walletWithEnable.enable({ starknetVersion: "v5" });
      
      // After enable(), the wallet has the expected properties
      const enabledWallet = wallet as unknown as EnabledWallet;

      if (!enabledWallet.isConnected || !enabledWallet.account) {
        throw new Error("Wallet connection failed");
      }

      // Store the starknet wallet object directly
      // The wallet.account is already an Account instance from starknet.js
      const walletAddress = enabledWallet.selectedAddress ?? null;
      const walletChainId = enabledWallet.chainId ?? null;
      const walletAccount = enabledWallet.account;

      setStarknet(enabledWallet);
      setAccount(walletAccount);
      setAddress(walletAddress);
      setChainId(walletChainId);
      setIsConnected(true);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("User abort") || msg.includes("cancel") || msg.includes("rejected")) {
        throw new Error("Connection cancelled");
      }
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    try {
      await disconnectStarknet({ clearLastWallet: true });
    } catch (_) {}
    setStarknet(null);
    setAccount(null);
    setAddress(null);
    setIsConnected(false);
    setChainId(null);
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!starknet) {
      throw new Error("Wallet not connected");
    }
    try {
      // Request chain switch to Sepolia
      await starknet.request({
        method: "wallet_switchStarknetChain",
        params: [{ chainId: "0x534e5f4d41494e455f5354504f4c4941" }], // SEPOLIA_CHAIN_ID
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("User abort") || msg.includes("cancel") || msg.includes("rejected")) {
        throw new Error("Chain switch cancelled");
      }
      throw error;
    }
  }, [starknet]);

  return (
    <WalletContext.Provider value={{
      starknet, account, address, isConnected, isConnecting, chainId, connect, disconnect, switchToSepolia,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWalletContext must be used within WalletProvider");
  return context;
}

export { WalletContext };

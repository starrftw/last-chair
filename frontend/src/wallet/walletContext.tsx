"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { Account, RpcProvider } from "starknet";
import { connect as connectWallet, disconnect as disconnectStarknet } from "get-starknet";

const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL || "https://free-rpc.nethermind.io/sepolia-juno";
const DEFAULT_SEPOLIA_CHAIN_ID = process.env.NEXT_PUBLIC_SEPOLIA_CHAIN_ID || "0x534e5f5345504f4c4941";
export const GAME_CONTRACT_ADDRESS = "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca";

// Valid Sepolia chain IDs - handle different formats wallets may return
const SEPOLIA_CHAIN_IDS = [
  "SN_SEPOLIA",
  DEFAULT_SEPOLIA_CHAIN_ID, // hex for "SN_SEPOLIA"
];

/**
 * Check if chainId is Sepolia (handles different formats)
 */
function isSepoliaNetwork(chainId: string | null): boolean {
  if (!chainId) return false;
  
  // Normalize: if it's a hex string, convert to uppercase for comparison
  const normalizedChainId = chainId.toUpperCase();
  const normalizedSepolia = "SN_SEPOLIA".toUpperCase();
  const normalizedHex = DEFAULT_SEPOLIA_CHAIN_ID.toUpperCase();
  
  // Direct comparison
  if (SEPOLIA_CHAIN_IDS.includes(chainId)) return true;
  
  // Case-insensitive comparison
  if (normalizedChainId === normalizedSepolia || normalizedChainId === normalizedHex) return true;
  
  // Check if it starts with SN_SEPOLIA
  if (normalizedChainId.startsWith("SN_SEPOLIA")) return true;
  
  return false;
}

interface WalletContextType {
  wallet: any | null;
  account: any | null;
  provider: RpcProvider | null;
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: string | null;
  isSepolia: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  switchToSepolia: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<any | null>(null);
  const [account, setAccount] = useState<any | null>(null);
  const [provider, setProvider] = useState<RpcProvider | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const starknetWallet = await connectWallet({
        modalMode: "alwaysAsk",
        modalTheme: "dark",
      });

      if (!starknetWallet) throw new Error("No wallet selected");

      await starknetWallet.enable();

      // Get account from enabled wallet - this is the Account instance needed for contract calls
      const walletAccount = (starknetWallet as any).account;
      if (!walletAccount) throw new Error("No account returned from wallet");

      const addr = starknetWallet.selectedAddress;
      if (!addr) throw new Error("No address returned from wallet");

      // Request chain ID explicitly - wallets don't always expose it on the object
      let currentChainId: string | null = null;
      try {
        currentChainId = await starknetWallet.request({ type: "starknet_chainId" }) as string;
      } catch (_) {
        // fallback: assume sepolia if we can't get chain id
        currentChainId = DEFAULT_SEPOLIA_CHAIN_ID;
      }

      console.log("Chain ID:", currentChainId);

      const rpcProvider = new RpcProvider({ nodeUrl: SEPOLIA_RPC_URL });

      setWallet(starknetWallet);
      setAccount(walletAccount);
      setProvider(rpcProvider);
      setAddress(addr);
      setChainId(currentChainId);
      setIsConnected(true);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("User abort") || msg.includes("cancel") || msg.includes("rejected") || msg.includes("closed")) {
        throw new Error("Connection cancelled");
      }
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!wallet) return;
    try {
      await wallet.request({
        type: "wallet_switchStarknetChain",
        params: { chainId: DEFAULT_SEPOLIA_CHAIN_ID },
      });
      setChainId(DEFAULT_SEPOLIA_CHAIN_ID);
    } catch (e) {
      console.error("Failed to switch network:", e);
    }
  }, [wallet]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectStarknet({ clearLastWallet: true });
    } catch (_) { }
    setWallet(null);
    setAccount(null);
    setProvider(null);
    setAddress(null);
    setIsConnected(false);
    setChainId(null);
  }, []);

  const isSepolia = isSepoliaNetwork(chainId);

  return (
    <WalletContext.Provider value={{
      wallet, account, provider, address, isConnected, isConnecting, chainId, isSepolia,
      connect, disconnect, switchToSepolia,
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

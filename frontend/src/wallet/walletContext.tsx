"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { RpcProvider } from "starknet";
import { connect as connectWallet, disconnect as disconnectStarknet } from "get-starknet";

const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_STARKNET_RPC_URL || "https://free-rpc.nethermind.io/sepolia-juno";
const DEFAULT_SEPOLIA_CHAIN_ID = process.env.NEXT_PUBLIC_SEPOLIA_CHAIN_ID || "0x534e5f5345504f4c4941";
export const GAME_CONTRACT_ADDRESS = "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca";

const SEPOLIA_CHAIN_IDS = ["SN_SEPOLIA", DEFAULT_SEPOLIA_CHAIN_ID];

function isSepoliaNetwork(chainId: string | null): boolean {
  if (!chainId) return false;
  const n = chainId.toUpperCase();
  if (SEPOLIA_CHAIN_IDS.includes(chainId)) return true;
  if (n === "SN_SEPOLIA" || n === DEFAULT_SEPOLIA_CHAIN_ID.toUpperCase()) return true;
  if (n.startsWith("SN_SEPOLIA")) return true;
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
  const [wallet, setWallet] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
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

      // Cast to any — get-starknet v4 types don't declare enable() but it exists at runtime
      await (starknetWallet as any).enable();

      const walletAccount = (starknetWallet as any).account;
      if (!walletAccount) throw new Error("No account returned from wallet");

      const addr = (starknetWallet as any).selectedAddress;
      if (!addr) throw new Error("No address returned from wallet");

      let currentChainId: string = DEFAULT_SEPOLIA_CHAIN_ID;
      try {
        currentChainId = await (starknetWallet as any).request({
          type: "starknet_chainId",
        }) as string;
      } catch (_) {
        // fallback to sepolia
      }

      console.log("Connected — chain:", currentChainId, "address:", addr);

      const rpcProvider = new RpcProvider({ nodeUrl: SEPOLIA_RPC_URL });

      setWallet(starknetWallet);
      setAccount(walletAccount);
      setProvider(rpcProvider);
      setAddress(addr);
      setChainId(currentChainId);
      setIsConnected(true);

    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (
        msg.includes("User abort") ||
        msg.includes("cancel") ||
        msg.includes("rejected") ||
        msg.includes("closed")
      ) {
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
      await (wallet as any).request({
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
      wallet, account, provider, address,
      isConnected, isConnecting, chainId, isSepolia,
      connect, disconnect, switchToSepolia,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used within WalletProvider");
  return ctx;
}

export { WalletContext };
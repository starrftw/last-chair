"use client";

import { useWalletContext } from "./walletContext";

/**
 * Hook to access wallet state and functions
 * Must be used within a WalletProvider
 */
export function useWallet() {
  const {
    starknet,
    account,
    address,
    isConnected,
    isConnecting,
    chainId,
    connect,
    disconnect,
    switchToSepolia,
  } = useWalletContext();

  /**
   * Format address for display (shortened)
   */
  const displayAddress = address 
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  /**
   * Check if wallet is on correct network (Sepolia)
   */
  const isSepolia = chainId === "0x534e5f4d41494e455f5354504f4c4941";

  return {
    // State - starknet is the wallet object for making direct RPC calls
    starknet,
    // Account for making contract calls (uses starknet internally)
    account,
    // Address from the wallet
    address,
    isConnected,
    isConnecting,
    chainId,
    displayAddress,
    isSepolia,
    
    // Actions
    connect,
    disconnect,
    switchToSepolia,
  };
}

export default useWallet;

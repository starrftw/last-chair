"use client";
import { useWalletContext } from "./walletContext";

export function useWallet() {
  const {
    wallet,
    account,
    provider,
    address,
    isConnected,
    isConnecting,
    chainId,
    isSepolia,
    connect,
    disconnect,
    switchToSepolia,
  } = useWalletContext();

  const displayAddress = address
    ? `${address.slice(0, 6)}...${address.slice(-4)}`
    : null;

  return {
    wallet,
    account,     // Account instance for contract calls
    starknet: wallet, // alias for backward compatibility
    provider,
    address,
    isConnected,
    isConnecting,
    chainId,
    displayAddress,
    isSepolia,
    connect,
    disconnect,
    switchToSepolia,
  };
}

export default useWallet;

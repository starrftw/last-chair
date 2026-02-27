"use client";

import { Account, Contract } from "starknet";

// Contract addresses on Starknet Sepolia
export const CONTRACT_ADDRESSES = {
  GAME: "0x00bf98bcca019014ea239db24ec63016b266df3e5e1041946147b66d9d9887eb",
  VERIFIER: "0x010cda95beb9f328337ed1d3e021e6468e830f3de17bdd1d8cffda258b0ca470",
} as const;

/**
 * Create a contract instance for interacting with the Game contract
 */
export function getGameContract(account: Account): Contract {
  const contract = new Contract({
    abi: GAME_ABI,
    address: CONTRACT_ADDRESSES.GAME,
  });
  // Attach account for signing transactions
  (contract as unknown as { account: Account }).account = account;
  return contract;
}

/**
 * Create a contract instance for interacting with the Verifier contract
 */
export function getVerifierContract(account: Account): Contract {
  const contract = new Contract({
    abi: VERIFIER_ABI,
    address: CONTRACT_ADDRESSES.VERIFIER,
  });
  // Attach account for signing transactions
  (contract as unknown as { account: Account }).account = account;
  return contract;
}

/**
 * Check if a wallet might be available
 * Note: With get-starknet, wallet detection happens during connect()
 * This function returns a hint that wallet support is available
 */
export function getInstalledWallet(): "argentX" | "braavos" | "starknet" | null {
  if (typeof window === "undefined") return null;
  
  // With get-starknet, we can't synchronously detect wallets
  // Return null to let the connect flow handle detection
  // The connect function will show appropriate errors if no wallet is found
  return "starknet";
}

/**
 * Get human-readable wallet name
 */
export function getWalletName(walletId: string | null): string {
  switch (walletId) {
    case "argentX":
      return "Argent X";
    case "braavos":
      return "Braavos";
    case "starknet":
      return "Starknet Wallet";
    default:
      return "Unknown Wallet";
  }
}

/**
 * Minimal Game Contract ABI (only needed functions)
 */
const GAME_ABI = [
  {
    name: "create_match",
    type: "function",
    inputs: [{ name: "entry_fee", type: "felt" }],
    outputs: [{ name: "match_id", type: "felt" }],
    state_mutability: "external",
  },
  {
    name: "join_match",
    type: "function",
    inputs: [{ name: "match_id", type: "felt" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "submit_commitment",
    type: "function",
    inputs: [
      { name: "match_id", type: "felt" },
      { name: "commitment", type: "felt" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "submit_proof",
    type: "function",
    inputs: [
      { name: "match_id", type: "felt" },
      { name: "proof", type: "felt" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "get_match",
    type: "function",
    inputs: [{ name: "match_id", type: "felt" }],
    outputs: [
      {
        name: "match",
        type: "(felt, felt, felt, felt, felt, felt)",
      },
    ],
    state_mutability: "view",
  },
];

/**
 * Minimal Verifier Contract ABI
 */
const VERIFIER_ABI = [
  {
    name: "verify_proof",
    type: "function",
    inputs: [{ name: "proof", type: "felt" }],
    outputs: [{ name: "result", type: "felt" }],
    state_mutability: "view",
  },
];

// Re-export for convenience
export { GAME_ABI, VERIFIER_ABI };

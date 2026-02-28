"use client";
import { Contract, RpcProvider, CallData } from "starknet";

export const CONTRACT_ADDRESSES = {
  GAME: "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca",
  VERIFIER: "0x010cda95beb9f328337ed1d3e021e6468e830f3de17bdd1d8cffda258b0ca470",
} as const;

const GAME_ABI = [
  {
    name: "create_match",
    type: "function",
    inputs: [{ name: "bet_amount", type: "core::integer::u256" }],
    outputs: [{ type: "core::integer::u256" }],
    state_mutability: "external",
  },
  {
    name: "join_match",
    type: "function",
    inputs: [{ name: "match_id", type: "core::integer::u256" }],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "submit_commitment",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
      { name: "commitment", type: "core::felt252" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "get_match",
    type: "function",
    inputs: [{ name: "match_id", type: "core::integer::u256" }],
    outputs: [],
    state_mutability: "view",
  },
] as const;

// walletAccount = wallet.account from get-starknet after enable()
export async function createMatch(walletAccount: any, betAmountWei: string) {
  return walletAccount.execute({
    contractAddress: CONTRACT_ADDRESSES.GAME,
    entrypoint: "create_match",
    calldata: CallData.compile({ bet_amount: { low: betAmountWei, high: "0" } }),
  });
}

export async function joinMatch(walletAccount: any, matchId: string) {
  return walletAccount.execute({
    contractAddress: CONTRACT_ADDRESSES.GAME,
    entrypoint: "join_match",
    calldata: CallData.compile({ match_id: { low: matchId, high: "0" } }),
  });
}

export async function submitCommitment(walletAccount: any, matchId: string, commitment: string) {
  return walletAccount.execute({
    contractAddress: CONTRACT_ADDRESSES.GAME,
    entrypoint: "submit_commitment",
    calldata: CallData.compile({
      match_id: { low: matchId, high: "0" },
      commitment,
    }),
  });
}

export async function getMatchData(provider: RpcProvider, matchId: string) {
  const contract = new Contract(GAME_ABI as any, CONTRACT_ADDRESSES.GAME, provider);
  return contract.get_match({ low: matchId, high: "0" });
}

// Keep getGameContract for backward compat with ChairSelection/RevealPhase
export function getGameContract(walletAccount: any): any {
  return {
    create_match: (bet: string) => createMatch(walletAccount, bet),
    join_match: (id: string) => joinMatch(walletAccount, id),
    submit_commitment: (id: string, c: string) => submitCommitment(walletAccount, id, c),
  };
}

export function getInstalledWallet() {
  if (typeof window === "undefined") return null;
  return "starknet";
}

export { GAME_ABI };

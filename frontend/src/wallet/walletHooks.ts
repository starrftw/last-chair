"use client";
import { RpcProvider, CallData } from "starknet";

// ============================================================================
// Network-aware contract addresses
// ============================================================================

const CONTRACTS: Record<string, { game: string; verifier: string }> = {
  "SN_SEPOLIA": {
    game: "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca",
    verifier: "0x010cda95beb9f328337ed1d3e021e6468e830f3de17bdd1d8cffda258b0ca470",
  },
  "0x534e5f5345504f4c4941": {  // hex of "SN_SEPOLIA" — some wallets return this
    game: "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca",
    verifier: "0x010cda95beb9f328337ed1d3e021e6468e830f3de17bdd1d8cffda258b0ca470",
  },
  "SN_MAIN": {
    game: "",  // TBD after mainnet deploy
    verifier: "",
  },
};

export function getContractAddresses(chainId: string) {
  return CONTRACTS[chainId] ?? CONTRACTS["SN_SEPOLIA"];
}

// Kept for any legacy references
export const CONTRACT_ADDRESSES = CONTRACTS["SN_SEPOLIA"];

// ============================================================================
// STRK token addresses
// ============================================================================

const STRK_TOKEN: Record<string, string> = {
  "SN_SEPOLIA": "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  "0x534e5f5345504f4c4941": "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
  "SN_MAIN": "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d",
};

export function getStrkToken(chainId: string) {
  return STRK_TOKEN[chainId] ?? STRK_TOKEN["SN_SEPOLIA"];
}

// ============================================================================
// V2 ABI — matches last_chair_game_v2.cairo exactly
// ============================================================================

export const GAME_ABI = [
  {
    name: "start_match",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
      { name: "stake", type: "core::integer::u256" },
      { name: "c1", type: "core::felt252" },
      { name: "c2", type: "core::felt252" },
      { name: "c3", type: "core::felt252" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "submit_reveal",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
      { name: "round", type: "core::integer::u8" },
      { name: "proof_with_hints", type: "core::array::Span::<core::felt252>" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "settle_round",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
      { name: "round", type: "core::integer::u8" },
    ],
    outputs: [],
    state_mutability: "external",
  },
  {
    name: "settle_match",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
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
  {
    name: "get_round",
    type: "function",
    inputs: [
      { name: "match_id", type: "core::integer::u256" },
      { name: "round", type: "core::integer::u8" },
    ],
    outputs: [],
    state_mutability: "view",
  },
] as const;

// ============================================================================
// Write calls — walletAccount = wallet.account from get-starknet
// ============================================================================

// Approve + start_match in ONE multicall (one wallet popup total)
// c1/c2/c3 = pedersen(chair, trap1, trap2, trap3, salt) per round
export async function approveAndStartMatch(
  walletAccount: any,
  chainId: string,
  matchId: string,
  stakeWei: string,
  c1: string,
  c2: string,
  c3: string,
) {
  const { game } = getContractAddresses(chainId);
  const strk = getStrkToken(chainId);

  return walletAccount.execute([
    {
      contractAddress: strk,
      entrypoint: "approve",
      calldata: [
        game,           // spender
        stakeWei,       // amount.low
        "0",            // amount.high
      ],
    },
    {
      contractAddress: game,
      entrypoint: "start_match",
      calldata: [
        matchId, "0",   // match_id (u256: low, high)
        stakeWei, "0",  // stake (u256: low, high)
        c1,             // felt252
        c2,             // felt252
        c3,             // felt252
      ],
    },
  ]);
}

// Submit ZK proof for a round
// proofWithHints = [...proof_felts, chair, trap1, trap2, trap3] as decimal strings
export async function submitReveal(
  walletAccount: any,
  chainId: string,
  matchId: string,
  round: number,
  proofWithHints: string[],
) {
  const { game } = getContractAddresses(chainId);
  return walletAccount.execute({
    contractAddress: game,
    entrypoint: "submit_reveal",
    calldata: CallData.compile({
      match_id: { low: matchId, high: "0" },
      round: round.toString(),
      proof_with_hints: proofWithHints,
    }),
  });
}

// Settle a round — callable by anyone after both reveals
export async function settleRound(
  walletAccount: any,
  chainId: string,
  matchId: string,
  round: number,
) {
  const { game } = getContractAddresses(chainId);
  return walletAccount.execute({
    contractAddress: game,
    entrypoint: "settle_round",
    calldata: CallData.compile({
      match_id: { low: matchId, high: "0" },
      round: round.toString(),
    }),
  });
}

// Distribute pot — callable by anyone after round 3 settled
export async function settleMatch(
  walletAccount: any,
  chainId: string,
  matchId: string,
) {
  const { game } = getContractAddresses(chainId);
  return walletAccount.execute({
    contractAddress: game,
    entrypoint: "settle_match",
    calldata: CallData.compile({
      match_id: { low: matchId, high: "0" },
    }),
  });
}

// ============================================================================
// Read calls — use provider, no wallet needed
// ============================================================================

export async function getMatchData(provider: RpcProvider, chainId: string, matchId: string) {
  const { game } = getContractAddresses(chainId);
  return provider.callContract({
    contractAddress: game,
    entrypoint: "get_match",
    calldata: CallData.compile({ match_id: { low: matchId, high: "0" } }),
  });
}

export async function getRoundData(
  provider: RpcProvider,
  chainId: string,
  matchId: string,
  round: number,
) {
  const { game } = getContractAddresses(chainId);
  return provider.callContract({
    contractAddress: game,
    entrypoint: "get_round",
    calldata: CallData.compile({ match_id: { low: matchId, high: "0" }, round: round.toString() }),
  });
}

// ============================================================================
// Commitment computation
// Usage: import { hash } from "starknet"; hash.pedersen([chair, trap1, trap2, trap3, salt])
// Call this once per round at match start — returns felt252 hex string
// ============================================================================

export function computeCommitments(
  rounds: Array<{ chair: number; trap1: number; trap2: number; trap3: number; salt: bigint }>,
  pedersenFn: (inputs: string[]) => string,
): [string, string, string] {
  if (rounds.length !== 3) throw new Error("Need exactly 3 rounds");
  return rounds.map(r =>
    pedersenFn([
      r.chair.toString(),
      r.trap1.toString(),
      r.trap2.toString(),
      r.trap3.toString(),
      r.salt.toString(),
    ])
  ) as [string, string, string];
}

export function getInstalledWallet() {
  if (typeof window === "undefined") return null;
  return "starknet";
}

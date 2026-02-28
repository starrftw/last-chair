import { Contract, RpcProvider, CallData } from "starknet";

export const GAME_CONTRACT_ADDRESS = "0x05c59e30eeca1796bbbc12f3d3a3f8bbb3403cef579428b1d55e6912b51429ca";

// ABI fragments we actually use
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
];

// Use wallet.account (the real Account object) for transactions
export async function createMatch(walletAccount: any, betAmountWei: string) {
  const result = await walletAccount.execute({
    contractAddress: GAME_CONTRACT_ADDRESS,
    entrypoint: "create_match",
    // u256 is passed as two felts: low, high
    calldata: CallData.compile({ bet_amount: { low: betAmountWei, high: "0" } }),
  });
  return result;
}

export async function joinMatch(walletAccount: any, matchId: string) {
  const result = await walletAccount.execute({
    contractAddress: GAME_CONTRACT_ADDRESS,
    entrypoint: "join_match",
    calldata: CallData.compile({ match_id: { low: matchId, high: "0" } }),
  });
  return result;
}

export async function submitCommitment(walletAccount: any, matchId: string, commitment: string) {
  const result = await walletAccount.execute({
    contractAddress: GAME_CONTRACT_ADDRESS,
    entrypoint: "submit_commitment",
    calldata: CallData.compile({
      match_id: { low: matchId, high: "0" },
      commitment,
    }),
  });
  return result;
}

export async function getMatch(provider: RpcProvider, matchId: string) {
  const contract = new Contract(GAME_ABI, GAME_CONTRACT_ADDRESS, provider);
  const result = await contract.get_match({ low: matchId, high: "0" });
  return result;
}

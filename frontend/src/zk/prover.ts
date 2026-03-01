/**
 * ZK Proof Prover for Last Chair Game
 *
 * Circuit: Noir 1.0.0-beta.1, bb 0.67.0, Garaga 0.15.5
 * Hash: pedersen_hash (std::hash::pedersen_hash in Noir)
 * Public input: single felt — pedersen(commitment, chair, trap1, trap2, trap3)
 *
 * proof_with_hints format sent to contract:
 *   [...proof_felts, chair, trap1, trap2, trap3]
 * Contract reads last 4 elements as revealed values.
 */

import { Barretenberg, Fr } from '@aztec/bb.js';
import { Noir } from '@noir-lang/noir_js';

// ─── State ────────────────────────────────────────────────────────────────────

let bbInstance: Barretenberg | null = null;
let noirInstance: Noir | null = null;
let isInitialized = false;
let circuitJson: any = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initializeProver(): Promise<void> {
  if (isInitialized) return;

  // Never run during SSR/prerender
  if (typeof window === 'undefined') {
    isInitialized = true;
    return;
  }

  try {
    bbInstance = await Barretenberg.new({ threads: 4 });
    // Try loading compiled circuit
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const mod = await (async () => { try { return require('@/circuits/last_chair.json'); } catch { return null; } })();
      if (mod) {
        circuitJson = mod.default ?? mod;
        const { Noir: NoirClass } = await import('@noir-lang/noir_js');
        noirInstance = new NoirClass(circuitJson);
        console.log('ZK Prover initialized — full mode');
      } else {
        console.info('No circuit found — simulation mode');
      }
    } catch (e) {
      console.warn('Circuit JSON not found — running in simulation mode:', e);
    }
    isInitialized = true;
  } catch (error) {
    console.warn('Barretenberg init failed — simulation mode:', error);
    isInitialized = true;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProveInput {
  chair: number;
  trap1: number;
  trap2: number;
  trap3: number;
  salt: bigint;
  commitment: bigint;  // pedersen(chair, trap1, trap2, trap3, salt) — stored on-chain
}

export interface ProofResult {
  // Felt252 strings ready to pass to submitReveal as proof_with_hints
  // Format: [...proof_felts, chair, trap1, trap2, trap3]
  proofFelts: string[];
  publicInputs: string[];
  isSimulation: boolean;
}

// ─── Main export ─────────────────────────────────────────────────────────────

export async function generateProof(input: ProveInput): Promise<ProofResult> {
  if (!isInitialized) throw new Error('Call initializeProver() first');

  validateInput(input);

  if (noirInstance && bbInstance && circuitJson) {
    return generateRealProof(input);
  }
  return generateSimulatedProof(input);
}

// ─── Real proof (when circuit JSON is available) ─────────────────────────────

async function generateRealProof(input: ProveInput): Promise<ProofResult> {
  try {
    const { UltraHonkBackend } = await import('@aztec/bb.js');
    const backend = new UltraHonkBackend(circuitJson);

    // Noir circuit inputs — all as decimal strings
    const circuitInputs = {
      position: input.chair.toString(),
      trap1: input.trap1.toString(),
      trap2: input.trap2.toString(),
      trap3: input.trap3.toString(),
      salt: input.salt.toString(),
      public_hash: input.commitment.toString(),
    };

    const { witness } = await noirInstance!.execute(circuitInputs);
    const { proof, publicInputs } = await backend.generateProof(witness);

    // Convert proof bytes to felt252 strings
    const proofFelts = Array.from(proof).map(b => b.toString());

    // Append revealed values — contract reads these from end of array
    const withHints = [
      ...proofFelts,
      input.chair.toString(),
      input.trap1.toString(),
      input.trap2.toString(),
      input.trap3.toString(),
    ];

    return {
      proofFelts: withHints,
      publicInputs: publicInputs.map(p => p.toString()),
      isSimulation: false,
    };
  } catch (err) {
    console.error('Real proof generation failed, falling back to simulation:', err);
    return generateSimulatedProof(input);
  }
}

// ─── Simulated proof (until circuit JSON is bundled) ─────────────────────────

function generateSimulatedProof(input: ProveInput): ProofResult {
  // Deterministic fake proof bytes
  const proofBytes: string[] = [];
  let seed = input.chair * 10000 + input.trap1 * 1000 + input.trap2 * 100 + input.trap3;
  for (let i = 0; i < 64; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    proofBytes.push((seed % 256).toString());
  }

  // Append hints — the 4 values contract reads
  const withHints = [
    ...proofBytes,
    input.chair.toString(),
    input.trap1.toString(),
    input.trap2.toString(),
    input.trap3.toString(),
  ];

  return {
    proofFelts: withHints,
    publicInputs: [input.commitment.toString()],
    isSimulation: true,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

function validateInput(input: ProveInput): void {
  const { chair, trap1, trap2, trap3 } = input;
  if (chair < 1 || chair > 12) throw new Error(`Chair must be 1-12, got ${chair}`);
  for (const [name, val] of [['trap1', trap1], ['trap2', trap2], ['trap3', trap3]] as const) {
    if (val < 1 || val > 12) throw new Error(`${name} must be 1-12, got ${val}`);
  }
  if (trap1 === trap2 || trap1 === trap3 || trap2 === trap3) throw new Error('Traps must be unique');
  if ([trap1, trap2, trap3].includes(chair)) throw new Error('Chair cannot be a trap');
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isProverReady(): boolean {
  return isInitialized;
}

export function isFullProverMode(): boolean {
  return noirInstance !== null && bbInstance !== null;
}

export async function destroyProver(): Promise<void> {
  bbInstance = null;
  noirInstance = null;
  isInitialized = false;
}

/**
 * Pedersen Hash implementation for commitment computation
 * 
 * This module provides the Pedersen hash function matching the Noir circuit
 * which uses std::hash::pedersen_hash for commitment computation.
 * 
 * The circuit computes:
 *   commitment = pedersen_hash([position, trap1, trap2, trap3, salt])
 *   public_hash = pedersen_hash([commitment, revealed_position, revealed_trap1, revealed_trap2, revealed_trap3])
 * 
 * Note: The circuit uses Pedersen hash (not Poseidon as mentioned in task description).
 * This implementation uses starknet.js's computeHashOnElements which uses Pedersen.
 */

import { hash } from 'starknet';

/**
 * Compute the Pedersen hash (commitment) from position, traps, and salt
 * This matches the circuit's first hash: pedersen_hash([position, trap1, trap2, trap3, salt])
 * 
 * @param position - The player's chosen position (1-12)
 * @param trap1 - First trap position (1-12)
 * @param trap2 - Second trap position (1-12)
 * @param trap3 - Third trap position (1-12)
 * @param salt - Random salt value for commitment
 * @returns The commitment as a bigint
 */
export function computeCommitment(
  position: number,
  trap1: number,
  trap2: number,
  trap3: number,
  salt: number
): bigint {
  // Convert to hex strings for starknet hash
  const inputs = [
    toHex(position),
    toHex(trap1),
    toHex(trap2),
    toHex(trap3),
    toHex(salt),
  ];

  // Use starknet's computeHashOnElements (Pedersen hash)
  const commitmentHex = hash.computeHashOnElements(inputs);
  return BigInt(commitmentHex);
}

/**
 * Compute the public hash that includes both commitment and revealed values
 * This matches the circuit's second hash: pedersen_hash([commitment, revealed_values...])
 * 
 * @param commitment - The initial commitment
 * @param revealedPosition - The position being revealed
 * @param revealedTrap1 - First trap being revealed
 * @param revealedTrap2 - Second trap being revealed
 * @param revealedTrap3 - Third trap being revealed
 * @returns The public hash as a bigint
 */
export function computePublicHash(
  commitment: bigint,
  revealedPosition: number,
  revealedTrap1: number,
  revealedTrap2: number,
  revealedTrap3: number
): bigint {
  const inputs = [
    '0x' + commitment.toString(16),
    toHex(revealedPosition),
    toHex(revealedTrap1),
    toHex(revealedTrap2),
    toHex(revealedTrap3),
  ];

  const publicHashHex = hash.computeHashOnElements(inputs);
  return BigInt(publicHashHex);
}

/**
 * Compute both commitment and public hash in one call
 * This is the main entry point for the frontend
 * 
 * @param position - Player's position (1-12)
 * @param trap1 - First trap (1-12)
 * @param trap2 - Second trap (1-12)
 * @param trap3 - Third trap (1-12)
 * @param salt - Random salt
 * @returns Object with commitment and publicHash
 */
export function computeCommitmentAndHash(
  position: number,
  trap1: number,
  trap2: number,
  trap3: number,
  salt: number
): { commitment: bigint; publicHash: bigint } {
  // Validate inputs are in range 1-12
  validatePosition(position, 'position');
  validatePosition(trap1, 'trap1');
  validatePosition(trap2, 'trap2');
  validatePosition(trap3, 'trap3');

  // Validate no duplicate traps
  const traps = [trap1, trap2, trap3];
  if (new Set(traps).size !== traps.length) {
    throw new Error('Traps must be unique');
  }

  // Validate position is not on a trap
  if (traps.includes(position)) {
    throw new Error('Position cannot be on a trap');
  }

  // Compute commitment
  const commitment = computeCommitment(position, trap1, trap2, trap3, salt);

  // Compute public hash (includes commitment and revealed values)
  const publicHash = computePublicHash(
    commitment,
    position,
    trap1,
    trap2,
    trap3
  );

  return { commitment, publicHash };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate that a position is in valid range (1-12)
 */
function validatePosition(value: number, name: string): void {
  if (value < 1 || value > 12) {
    throw new Error(`${name} must be between 1 and 12, got ${value}`);
  }
}

/**
 * Convert a number to a hex string
 */
function toHex(value: number): string {
  return '0x' + value.toString(16);
}

/**
 * Generate a random salt for commitment
 */
export function generateSalt(): number {
  // Generate random number in valid range (1-12)
  return Math.floor(Math.random() * 12) + 1;
}

/**
 * Convert a hex string to bigint
 */
export function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

/**
 * Convert bigint to hex string
 */
export function bigIntToHex(value: bigint): string {
  return '0x' + value.toString(16);
}

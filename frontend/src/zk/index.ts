/**
 * ZK Module for Last Chair Game
 * 
 * This module provides zero-knowledge proof functionality for the game,
 * enabling players to prove they have a valid position/trap configuration
 * without revealing their actual values.
 * 
 * @module zk
 */

// Commitment computation (Pedersen hash)
export {
  computeCommitment,
  computePublicHash,
  computeCommitmentAndHash,
  generateSalt,
  hexToBigInt,
  bigIntToHex,
} from './pedersen';

// Proof generation and verification
export {
  initializeProver,
  generateProof,
  verifyProof,
  destroyProver,
  isProverReady,
  isFullProverMode,
  type ProofResult,
} from './prover';

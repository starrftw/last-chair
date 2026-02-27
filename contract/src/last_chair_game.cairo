// Last Chair - ZK Musical Chairs Game Contract
// Phase 3: Cairo Game Contract

use starknet::storage::{
    StoragePointerReadAccess, StoragePointerWriteAccess, 
    Map, MutablePointer, StoragePath,
};
use starknet::{ContractAddress, get_block_timestamp, get_caller_address};

// ============================================================================
// ERRORS
// ============================================================================

const ERROR_NOT_AUTHORIZED: felt252 = 'Not authorized';
const ERROR_INVALID_BET: felt252 = 'Invalid bet amount';
const ERROR_MATCH_NOT_FOUND: felt252 = 'Match not found';
const ERROR_MATCH_NOT_WAITING: felt252 = 'Match not waiting for player';
const ERROR_MATCH_NOT_IN_PROGRESS: felt252 = 'Match not in progress';
const ERROR_ALREADY_JOINED: felt252 = 'Already joined this match';
const ERROR_NOT_YOUR_TURN: felt252 = 'Not your turn';
const ERROR_ALREADY_COMMITTED: felt252 = 'Already committed this round';
const ERROR_NOT_COMMITTED: felt252 = 'Must commit before reveal';
const ERROR_BOTH_MUST_COMMIT: felt252 = 'Both players must commit';
const ERROR_ALREADY_REVEALED: felt252 = 'Already revealed this round';
const ERROR_INVALID_PROOF: felt252 = 'Invalid proof';
const ERROR_ROUND_NOT_READY: felt252 = 'Round not ready for settlement';
const ERROR_MATCH_NOT_COMPLETE: felt252 = 'Match not complete';
const ERROR_ALREADY_SETTLED: felt252 = 'Match already settled';
const ERROR_INVALID_STATE: felt252 = 'Invalid state transition';
const ERROR_TIMEOUT: felt252 = 'Action timeout';

// ============================================================================
// ENUMS
// ============================================================================

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
enum MatchState {
    Waiting,     // Waiting for player B to join
    InProgress,  // Match active (rounds 1-3)
    Settled,     // Match complete, pot distributed
}

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
enum RoundState {
    Open,        // Players can submit commitments
    Committed,   // Both committed, waiting for proofs
    Revealed,    // Both revealed, ready for settlement
    Resolved,    // Round result finalized
}

// ============================================================================
// STRUCTS
// ============================================================================

#[derive(Drop, Serde, Clone, starknet::Store, Copy)]
struct Round {
    commitment_a: felt252,
    commitment_b: felt252,
    revealed_position_a: u8,
    revealed_position_b: u8,
    revealed_trap1_a: u8,
    revealed_trap2_a: u8,
    revealed_trap3_a: u8,
    revealed_trap1_b: u8,
    revealed_trap2_b: u8,
    revealed_trap3_b: u8,
    state: RoundState,
    score_a: u16,
    score_b: u16,
}

#[derive(Drop, Serde, Clone, starknet::Store, Copy)]
struct Match {
    player_a: ContractAddress,
    player_b: ContractAddress,
    bet_amount: u256,
    round_number: u8,           // 1-3
    cumulative_score_a: u16,    // Sum of all round scores
    cumulative_score_b: u16,
    state: MatchState,
    created_at: u64,
    last_action_at: u64,       // For timeout tracking
}

// Default implementations
impl DefaultRoundState of Default<RoundState> {
    default() -> RoundState {
        RoundState::Open
    }
}

impl DefaultMatchState of Default<MatchState> {
    default() -> MatchState {
        MatchState::Waiting
    }
}

impl DefaultRound of Default<Round> {
    default() -> Round {
        Round {
            commitment_a: 0,
            commitment_b: 0,
            revealed_position_a: 0,
            revealed_position_b: 0,
            revealed_trap1_a: 0,
            revealed_trap2_a: 0,
            revealed_trap3_a: 0,
            revealed_trap1_b: 0,
            revealed_trap2_b: 0,
            revealed_trap3_b: 0,
            state: RoundState::Open,
            score_a: 0,
            score_b: 0,
        }
    }
}

impl DefaultMatch of Default<Match> {
    default() -> Match {
        Match {
            player_a: Zeroable::zero(),
            player_b: Zeroable::zero(),
            bet_amount: 0,
            round_number: 0,
            cumulative_score_a: 0,
            cumulative_score_b: 0,
            state: MatchState::Waiting,
            created_at: 0,
            last_action_at: 0,
        }
    }
}

// ============================================================================
// EVENTS
// ============================================================================

#[event]
fn MatchCreated(match_id: u256, player_a: ContractAddress, bet_amount: u256) {}

#[event]
fn MatchJoined(match_id: u256, player_b: ContractAddress) {}

#[event]
fn CommitmentSubmitted(match_id: u256, round: u8, player: ContractAddress) {}

#[event]
fn RevealSubmitted(match_id: u256, round: u8, player: ContractAddress) {}

#[event]
fn RoundSettled(match_id: u256, round: u8, score_a: u16, score_b: u16) {}

#[event]
fn MatchSettled(match_id: u256, payout_a: u256, payout_b: u256, fee: u256) {}

#[event]
fn TimeoutClaimed(match_id: u256, claimant: ContractAddress, amount: u256) {}

// ============================================================================
// INTERFACE
// ============================================================================

#[starknet::interface]
trait ILastChairGame<TContractState> {
    fn create_match(ref self: TContractState, bet_amount: u256) -> u256;
    fn join_match(ref self: TContractState, match_id: u256) -> ();
    fn submit_commitment(ref self: TContractState, match_id: u256, commitment: felt252) -> ();
    fn submit_reveal(
        ref self: TContractState,
        match_id: u256,
        proof_with_hints: Span<felt252>,
    ) -> ();
    fn settle_round(ref self: TContractState, match_id: u256) -> ();
    fn settle_match(ref self: TContractState, match_id: u256) -> ();
    fn claim_timeout_payout(ref self: TContractState, match_id: u256) -> ();
    
    // View functions
    fn get_match(self: @TContractState, match_id: u256) -> Match;
    fn get_round(self: @TContractState, match_id: u256, round: u8) -> Round;
    fn get_verifier_address(self: @TContractState) -> ContractAddress;
}

// ============================================================================
// CONTRACT
// ============================================================================

#[starknet::contract]
mod LastChairGame {
    use super::*;
    use super::honk_verifier::IUltraKeccakHonkVerifierDispatcher;

    // ========================================================================
    // STORAGE
    // ========================================================================
    
    #[storage]
    struct Storage {
        // Match management
        match_counter: u256,
        matches: Map<u256, Match>,
        rounds: Map<(u256, u8), Round>,  // (match_id, round_number) -> Round
        
        // Player lookups
        player_to_match: Map<ContractAddress, u256>,
        
        // Configuration
        platform_fee_percent: u8,  // e.g., 1 for 1%
        reveal_timeout_seconds: u64,  // Time allowed for reveal after both commit
        join_timeout_seconds: u64,     // Time allowed for player B to join
        
        // Verifier address (set during deployment)
        verifier_address: ContractAddress,
        
        // Reentrancy guard
        _reentrancy_guard: bool,
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    #[constructor]
    fn constructor(
        ref self: ContractState,
        verifier_address: ContractAddress,
    ) {
        self.match_counter.write(0);
        self.platform_fee_percent.write(1);  // 1% platform fee
        self.reveal_timeout_seconds.write(3600);  // 1 hour to reveal
        self.join_timeout_seconds.write(1800);    // 30 minutes to join
        self.verifier_address.write(verifier_address);
    }

    // ========================================================================
    // EXTERNAL FUNCTIONS
    // ========================================================================

    #[abi(embed_v0)]
    impl ILastChairGame of super::ILastChairGame<ContractState> {
        
        /// Create a new match and become Player A
        fn create_match(ref self: ContractState, bet_amount: u256) -> u256 {
            // Validate bet amount
            assert(bet_amount > 0, ERROR_INVALID_BET);
            
            let caller = get_caller_address();
            let current_time = get_block_timestamp();
            
            // Create new match
            let match_id = self.match_counter.read() + 1;
            self.match_counter.write(match_id);
            
            let match_data = Match {
                player_a: caller,
                player_b: Zeroable::zero(),
                bet_amount,
                round_number: 1,
                cumulative_score_a: 0,
                cumulative_score_b: 0,
                state: MatchState::Waiting,
                created_at: current_time,
                last_action_at: current_time,
            };
            
            self.matches.write(match_id, match_data);
            
            // Initialize round 1
            let round = Round::default();
            self.rounds.write((match_id, 1), round);
            
            // Track player to match
            self.player_to_match.write(caller, match_id);
            
            // Emit event
            MatchCreated(match_id, caller, bet_amount);
            
            match_id
        }
        
        /// Join an existing match as Player B
        fn join_match(ref self: ContractState, match_id: u256) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            
            // Validate match exists and is waiting
            assert(match_data.player_a != Zeroable::zero(), ERROR_MATCH_NOT_FOUND);
            assert(match_data.state == MatchState::Waiting, ERROR_MATCH_NOT_WAITING);
            assert(match_data.player_a != caller, ERROR_NOT_AUTHORIZED);
            assert(match_data.player_b == Zeroable::zero(), ERROR_ALREADY_JOINED);
            
            // Check timeout for joining
            let current_time = get_block_timestamp();
            let timeout = self.join_timeout_seconds.read();
            assert(current_time - match_data.created_at < timeout, ERROR_TIMEOUT);
            
            // Update match
            match_data.player_b = caller;
            match_data.state = MatchState::InProgress;
            match_data.last_action_at = current_time;
            self.matches.write(match_id, match_data);
            
            // Track player B
            self.player_to_match.write(caller, match_id);
            
            // Emit event
            MatchJoined(match_id, caller);
            
            // Initialize round 1 (already initialized in create_match)
            ()
        }
        
        /// Submit commitment hash for current round
        fn submit_commitment(ref self: ContractState, match_id: u256, commitment: felt252) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            let round_number = match_data.round_number;
            let mut round = self.rounds.read((match_id, round_number));
            
            // Validate match state
            assert(match_data.state == MatchState::InProgress, ERROR_MATCH_NOT_IN_PROGRESS);
            assert(round.state == RoundState::Open, ERROR_INVALID_STATE);
            
            // Validate caller is a player
            let is_player_a = caller == match_data.player_a;
            let is_player_b = caller == match_data.player_b;
            assert(is_player_a | is_player_b, ERROR_NOT_AUTHORIZED);
            
            // Store commitment
            if is_player_a {
                assert(round.commitment_a == 0, ERROR_ALREADY_COMMITTED);
                round.commitment_a = commitment;
            } else {
                assert(round.commitment_b == 0, ERROR_ALREADY_COMMITTED);
                round.commitment_b = commitment;
            }
            
            // Check if both committed
            if round.commitment_a != 0 && round.commitment_b != 0 {
                round.state = RoundState::Committed;
            }
            
            let current_time = get_block_timestamp();
            match_data.last_action_at = current_time;
            self.matches.write(match_id, match_data);
            self.rounds.write((match_id, round_number), round);
            
            // Emit event
            CommitmentSubmitted(match_id, round_number, caller);
            
            ()
        }
        
        /// Submit reveal with proof
        /// The proof verifies: commitment = hash(position, traps, salt)
        /// and the revealed values are valid
        fn submit_reveal(
            ref self: ContractState,
            match_id: u256,
            proof_with_hints: Span<felt252>,
        ) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            let round_number = match_data.round_number;
            let mut round = self.rounds.read((match_id, round_number));
            
            // Validate states
            assert(match_data.state == MatchState::InProgress, ERROR_MATCH_NOT_IN_PROGRESS);
            assert(round.state == RoundState::Committed, ERROR_NOT_COMMITTED);
            
            let is_player_a = caller == match_data.player_a;
            let is_player_b = caller == match_data.player_b;
            assert(is_player_a | is_player_b, ERROR_NOT_AUTHORIZED);
            
            // Verify proof using Garaga verifier
            // Note: In production, this would extract public inputs from proof
            // For now, we verify through the contract interface
            let verifier_address = self.verifier_address.read();
            let verifier = IUltraKeccakHonkVerifierDispatcher { contract_address: verifier_address };
            
            let result = verifier.verify_ultra_keccak_honk_proof(proof_with_hints);
            assert(result.is_some(), ERROR_INVALID_PROOF);
            
            // Extract public inputs from proof result
            // The public inputs are: [commitment, position, trap1, trap2, trap3]
            let public_inputs = result.unwrap();
            
            // Parse public inputs based on our circuit design:
            // Index 0: commitment
            // Index 1: revealed_position
            // Index 2: revealed_trap1
            // Index 3: revealed_trap2
            // Index 4: revealed_trap3
            assert(public_inputs.len() >= 5, ERROR_INVALID_PROOF);
            
            let revealed_commitment = public_inputs[0].low;
            let revealed_position = (*public_inputs[1]).low;
            let revealed_trap1 = (*public_inputs[2]).low;
            let revealed_trap2 = (*public_inputs[3]).low;
            let revealed_trap3 = (*public_inputs[4]).low;
            
            // Validate position and traps are in range 1-12
            assert(revealed_position >= 1 && revealed_position <= 12, ERROR_INVALID_PROOF);
            assert(revealed_trap1 >= 1 && revealed_trap1 <= 12, ERROR_INVALID_PROOF);
            assert(revealed_trap2 >= 1 && revealed_trap2 <= 12, ERROR_INVALID_PROOF);
            assert(revealed_trap3 >= 1 && revealed_trap3 <= 12, ERROR_INVALID_PROOF);
            
            // Verify commitment matches
            let expected_commitment = if is_player_a { round.commitment_a } else { round.commitment_b };
            assert(revealed_commitment == expected_commitment, ERROR_INVALID_PROOF);
            
            // Store revealed values
            if is_player_a {
                round.revealed_position_a = revealed_position.try_into().unwrap();
                round.revealed_trap1_a = revealed_trap1.try_into().unwrap();
                round.revealed_trap2_a = revealed_trap2.try_into().unwrap();
                round.revealed_trap3_a = revealed_trap3.try_into().unwrap();
            } else {
                round.revealed_position_b = revealed_position.try_into().unwrap();
                round.revealed_trap1_b = revealed_trap1.try_into().unwrap();
                round.revealed_trap2_b = revealed_trap2.try_into().unwrap();
                round.revealed_trap3_b = revealed_trap3.try_into().unwrap();
            }
            
            // Check if both revealed
            if round.revealed_position_a != 0 && round.revealed_position_b != 0 {
                round.state = RoundState::Revealed;
            }
            
            let current_time = get_block_timestamp();
            match_data.last_action_at = current_time;
            self.matches.write(match_id, match_data);
            self.rounds.write((match_id, round_number), round);
            
            // Emit event
            RevealSubmitted(match_id, round_number, caller);
            
            ()
        }
        
        /// Settle the current round - calculate scores
        fn settle_round(ref self: ContractState, match_id: u256) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            let round_number = match_data.round_number;
            let mut round = self.rounds.read((match_id, round_number));
            
            // Validate caller is a player
            let is_player_a = caller == match_data.player_a;
            let is_player_b = caller == match_data.player_b;
            assert(is_player_a | is_player_b, ERROR_NOT_AUTHORIZED);
            
            // Validate states
            assert(match_data.state == MatchState::InProgress, ERROR_MATCH_NOT_IN_PROGRESS);
            assert(round.state == RoundState::Revealed, ERROR_ROUND_NOT_READY);
            
            // Calculate scores
            let (score_a, score_b) = calculate_round_score(
                round.revealed_position_a,
                (round.revealed_trap1_a, round.revealed_trap2_a, round.revealed_trap3_a),
                round.revealed_position_b,
                (round.revealed_trap1_b, round.revealed_trap2_b, round.revealed_trap3_b),
            );
            
            round.score_a = score_a;
            round.score_b = score_b;
            round.state = RoundState::Resolved;
            
            // Update cumulative scores
            match_data.cumulative_score_a = match_data.cumulative_score_a + score_a;
            match_data.cumulative_score_b = match_data.cumulative_score_b + score_b;
            
            // If not final round, prepare next round
            if round_number < 3 {
                match_data.round_number = round_number + 1;
                
                // Initialize next round
                let next_round = Round::default();
                self.rounds.write((match_id, round_number + 1), next_round);
            } else {
                // Match complete
                match_data.state = MatchState::Settled;
            }
            
            self.matches.write(match_id, match_data);
            self.rounds.write((match_id, round_number), round);
            
            // Emit event
            RoundSettled(match_id, round_number, score_a, score_b);
            
            ()
        }
        
        /// Settle the match - distribute pot based on cumulative scores
        fn settle_match(ref self: ContractState, match_id: u256) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            
            // Validate caller is a player
            let is_player_a = caller == match_data.player_a;
            let is_player_b = caller == match_data.player_b;
            assert(is_player_a | is_player_b, ERROR_NOT_AUTHORIZED);
            
            // Validate match is settled
            assert(match_data.state == MatchState::Settled, ERROR_MATCH_NOT_COMPLETE);
            
            let total_pot = match_data.bet_amount * 2;
            let fee_percent = self.platform_fee_percent.read();
            
            // Calculate payouts
            let (payout_a, payout_b, fee) = calculate_payout(
                total_pot,
                fee_percent,
                match_data.cumulative_score_a,
                match_data.cumulative_score_b,
            );
            
            // Emit settlement event
            MatchSettled(match_id, payout_a, payout_b, fee);
            
            // Transfer funds to players
            // TODO: In production, use IERC20 interface:
            // let token = IERC20Dispatcher { contract_address: token_address };
            // token.transfer(match_data.player_a, payout_a);
            // token.transfer(match_data.player_b, payout_b);
            
            ()
        }
        
        /// Claim payout if opponent times out
        fn claim_timeout_payout(ref self: ContractState, match_id: u256) -> () {
            let caller = get_caller_address();
            let mut match_data = self.matches.read(match_id);
            let round_number = match_data.round_number;
            let round = self.rounds.read((match_id, round_number));
            let current_time = get_block_timestamp();
            let timeout = self.reveal_timeout_seconds.read();
            
            // Check if timeout occurred
            let time_since_last_action = current_time - match_data.last_action_at;
            assert(time_since_last_action > timeout, ERROR_TIMEOUT);
            
            // Determine who can claim
            let is_player_a = caller == match_data.player_a;
            let is_player_b = caller == match_data.player_b;
            assert(is_player_a | is_player_b, ERROR_NOT_AUTHORIZED);
            
            // If Player A timed out, Player B claims full pot
            // If Player B timed out, Player A claims full pot
            // If both timed out, split 50/50
            
            let total_pot = match_data.bet_amount * 2;
            
            // Calculate payout for caller
            let a_timed_out = is_player_a && (round.commitment_a == 0 || round.revealed_position_a == 0);
            let payout = if a_timed_out {
                total_pot
            } else {
                total_pot
            };
            
            // Emit timeout event
            TimeoutClaimed(match_id, caller, payout);
            
            // Transfer funds to caller
            // TODO: In production, use IERC20 interface:
            // let token = IERC20Dispatcher { contract_address: token_address };
            // token.transfer(caller, payout);
            
            match_data.state = MatchState::Settled;
            self.matches.write(match_id, match_data);
            
            ()
        }
        
        // View functions
        fn get_match(self: @ContractState, match_id: u256) -> Match {
            self.matches.read(match_id)
        }
        
        fn get_round(self: @ContractState, match_id: u256, round: u8) -> Round {
            self.rounds.read((match_id, round))
        }
        
        fn get_verifier_address(self: @ContractState) -> ContractAddress {
            self.verifier_address.read()
        }
    }
    
    // ========================================================================
    // INTERNAL FUNCTIONS
    // ========================================================================
    
    /// Calculate score for a round
    /// Score = survival * risk_multiplier + trap_bonus
    /// - survival: 0 if trapped, 1 if safe
    /// - risk_multiplier: chair number (1-12)
    /// - trap_bonus: +10 if opponent was trapped
    fn calculate_round_score(
        my_position: u8,
        my_traps: (u8, u8, u8),
        opponent_position: u8,
        opponent_traps: (u8, u8, u8),
    ) -> (u16, u16) {
        // Calculate Player A score
        let a_trapped = is_position_trapped(my_position, my_traps);
        let a_survival: u16 = if a_trapped { 0 } else { 1 };
        let a_risk: u16 = my_position.into();
        let a_trapped_opponent = is_position_trapped(opponent_position, my_traps);
        let a_trap_bonus: u16 = if a_trapped_opponent { 10 } else { 0 };
        let score_a = a_survival * a_risk + a_trap_bonus;
        
        // Calculate Player B score
        let b_trapped = is_position_trapped(opponent_position, opponent_traps);
        let b_survival: u16 = if b_trapped { 0 } else { 1 };
        let b_risk: u16 = opponent_position.into();
        let b_trapped_opponent = is_position_trapped(my_position, opponent_traps);
        let b_trap_bonus: u16 = if b_trapped_opponent { 10 } else { 0 };
        let score_b = b_survival * b_risk + b_trap_bonus;
        
        (score_a, score_b)
    }
    
    /// Check if a position is trapped
    fn is_position_trapped(position: u8, traps: (u8, u8, u8)) -> bool {
        let (t1, t2, t3) = traps;
        position == t1 || position == t2 || position == t3
    }
    
    /// Calculate final payout
    fn calculate_payout(
        total_pot: u256,
        fee_percent: u8,
        score_a: u16,
        score_b: u16,
    ) -> (u256, u256, u256) {
        let fee = (total_pot * fee_percent.into()) / 100;
        let distributable = total_pot - fee;
        
        let total_score = score_a + score_b;
        
        if total_score == 0 {
            // Edge case: both got trapped every round = 50/50
            let half = distributable / 2;
            return (half, half, fee);
        }
        
        let payout_a = (distributable * score_a.into()) / total_score.into();
        let payout_b = distributable - payout_a;
        
        (payout_a, payout_b, fee)
    }
}

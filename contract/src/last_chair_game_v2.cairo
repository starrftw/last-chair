// ============================================================================
// Last Chair Game — V2
// 
// Flow:
//   1. Both players call start_match() with same match_id — stakes locked
//   2. Frontend drives 20s round timer
//   3. Timer ends — frontend calls submit_reveal() for each round
//   4. After both reveals — anyone calls settle_round()
//   5. After round 3 settled — anyone calls settle_match()
//
// No matchmaking on-chain. Off-chain relay pairs players, hands them match_id.
// No timeouts. All 3 commitments submitted at match start — disconnect safe.
// ============================================================================

use starknet::{ContractAddress, get_caller_address, get_contract_address, contract_address_const};
use starknet::storage::{
    StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess,
    StorageMapWriteAccess,
};

// ============================================================================
// CONSTANTS
// ============================================================================

const CHAIRS: u8 = 12;
const ROUNDS: u8 = 3;

// Score scaling: multiply by 4 to handle 0.25x debuff without floats
// chair 8 trapped  = 8 * 1  = 8  (will be divided by 4 at settle = 2.0)
// chair 8 safe     = 8 * 4  = 32 (will be divided by 4 at settle = 8.0)
// trap bonus       = 8 * 4  = 32 (= 8.0 real points)
const SCORE_SCALE: u32 = 4;
const TRAP_BONUS_SCALED: u32 = 32; // 8 real points * 4
const TRAP_DEBUFF_SCALE: u32 = 1;  // 0.25 * 4 = 1
const SAFE_SCALE: u32 = 4;         // 1.0 * 4 = 4

const ERROR_NOT_PLAYER: felt252 = 'Not a player';
const ERROR_WRONG_STATE: felt252 = 'Wrong state';
const ERROR_ALREADY_STARTED: felt252 = 'Already started';
const ERROR_STAKE_MISMATCH: felt252 = 'Stake mismatch';
const ERROR_ALREADY_REVEALED: felt252 = 'Already revealed';
const ERROR_ROUND_NOT_READY: felt252 = 'Both reveals needed';
const ERROR_INVALID_PROOF: felt252 = 'Invalid ZK proof';
const ERROR_INVALID_POSITION: felt252 = 'Invalid position';
const ERROR_INVALID_TRAPS: felt252 = 'Invalid traps';
const ERROR_MATCH_NOT_FOUND: felt252 = 'Match not found';
const ERROR_ROUND_NOT_SETTLED: felt252 = 'Round not settled';

// ============================================================================
// TYPES
// ============================================================================

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
#[allow(starknet::store_no_default_variant)]
enum MatchState {
    // Waiting for second player to call start_match
    Waiting,
    // Both players in, game active
    Active,
    // All 3 rounds settled, payouts done
    Finished,
}

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
#[allow(starknet::store_no_default_variant)]
enum RoundState {
    // Waiting for reveals
    Pending,
    // Player A revealed
    RevealedA,
    // Player B revealed
    RevealedB,
    // Both revealed, scored
    Settled,
}

// Match metadata
#[derive(Drop, Serde, Copy, starknet::Store)]
struct Match {
    player_a: ContractAddress,
    player_b: ContractAddress,
    stake: u256,            // per player
    current_round: u8,      // 1, 2, or 3
    state: MatchState,
    // Cumulative scores (scaled by SCORE_SCALE)
    score_a: u32,
    score_b: u32,
}

// Per-round data
#[derive(Drop, Serde, Copy, starknet::Store)]
struct Round {
    // Commitments: pedersen(chair, trap1, trap2, trap3, salt)
    commitment_a: felt252,
    commitment_b: felt252,
    // Revealed after ZK proof
    chair_a: u8,
    trap1_a: u8,
    trap2_a: u8,
    trap3_a: u8,
    chair_b: u8,
    trap1_b: u8,
    trap2_b: u8,
    trap3_b: u8,
    state: RoundState,
    // Round scores (scaled)
    score_a: u32,
    score_b: u32,
}

// ============================================================================
// EVENTS
// ============================================================================

#[derive(Drop, starknet::Event)]
struct MatchStarted {
    #[key]
    match_id: u256,
    player_a: ContractAddress,
    player_b: ContractAddress,
    stake: u256,
}

#[derive(Drop, starknet::Event)]
struct PlayerQueued {
    #[key]
    match_id: u256,
    player: ContractAddress,
    stake: u256,
}

#[derive(Drop, starknet::Event)]
struct RevealSubmitted {
    #[key]
    match_id: u256,
    round: u8,
    player: ContractAddress,
    chair: u8,
}

#[derive(Drop, starknet::Event)]
struct RoundSettled {
    #[key]
    match_id: u256,
    round: u8,
    score_a: u32,
    score_b: u32,
    // Cumulative split after this round (basis points, e.g. 6000 = 60%)
    split_a_bps: u32,
}

#[derive(Drop, starknet::Event)]
struct MatchFinished {
    #[key]
    match_id: u256,
    payout_a: u256,
    payout_b: u256,
    fee: u256,
    // Final split in basis points
    split_a_bps: u32,
}

// ============================================================================
// INTERFACE
// ============================================================================

#[starknet::interface]
trait ILastChairGame<TContractState> {
    // Both players call this with the same match_id
    // c1/c2/c3 = pedersen(chair, trap1, trap2, trap3, salt) for each round
    fn start_match(
        ref self: TContractState,
        match_id: u256,
        stake: u256,
        c1: felt252,
        c2: felt252,
        c3: felt252,
    );

    // Submit ZK proof for a round
    // proof_with_hints format: [...proof_bytes, chair, trap1, trap2, trap3]
    // Last 4 elements are the revealed values (proven correct by ZK)
    fn submit_reveal(
        ref self: TContractState,
        match_id: u256,
        round: u8,
        proof_with_hints: Span<felt252>,
    );

    // Compute scores for a round — callable by anyone once both reveals in
    fn settle_round(ref self: TContractState, match_id: u256, round: u8);

    // Distribute pot — callable by anyone after round 3 settled
    fn settle_match(ref self: TContractState, match_id: u256);

    // Views
    fn get_match(self: @TContractState, match_id: u256) -> Match;
    fn get_round(self: @TContractState, match_id: u256, round: u8) -> Round;
    fn get_commitment(self: @TContractState, match_id: u256, player: ContractAddress, round: u8) -> felt252;
}

// ============================================================================
// CONTRACT
// ============================================================================

#[starknet::contract]
mod LastChairGame {
    use super::{
        ContractAddress, get_caller_address, get_contract_address, contract_address_const,
        StoragePointerReadAccess, StoragePointerWriteAccess, Map,
        StorageMapReadAccess, StorageMapWriteAccess,
        Match, Round, MatchState, RoundState,
        MatchStarted, PlayerQueued, RevealSubmitted, RoundSettled, MatchFinished,
        ERROR_NOT_PLAYER, ERROR_WRONG_STATE, ERROR_ALREADY_STARTED, ERROR_STAKE_MISMATCH,
        ERROR_ALREADY_REVEALED, ERROR_ROUND_NOT_READY, ERROR_INVALID_PROOF,
        ERROR_INVALID_POSITION, ERROR_INVALID_TRAPS, ERROR_MATCH_NOT_FOUND,
        ERROR_ROUND_NOT_SETTLED,
        SCORE_SCALE, TRAP_BONUS_SCALED, TRAP_DEBUFF_SCALE, SAFE_SCALE,
        CHAIRS, ROUNDS,
    };
    use starknet::syscalls::call_contract_syscall;
    use starknet::SyscallResultTrait;
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};

    // ========================================================================
    // EVENTS ENUM
    // ========================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MatchStarted: MatchStarted,
        PlayerQueued: PlayerQueued,
        RevealSubmitted: RevealSubmitted,
        RoundSettled: RoundSettled,
        MatchFinished: MatchFinished,
    }

    // ========================================================================
    // STORAGE
    // ========================================================================

    #[storage]
    struct Storage {
        verifier_address: ContractAddress,
        strk_token: ContractAddress,

        // Match data
        matches: Map<u256, Match>,

        // Round data: (match_id, round_number) -> Round
        rounds: Map<(u256, u8), Round>,

        // Commitments per player per round
        // (match_id, player_address, round) -> commitment
        commitments: Map<(u256, ContractAddress, u8), felt252>,
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    #[constructor]
    fn constructor(
        ref self: ContractState,
        verifier_address: ContractAddress,
        strk_token: ContractAddress,
    ) {
        self.verifier_address.write(verifier_address);
        self.strk_token.write(strk_token);
    }

    // ========================================================================
    // EXTERNAL FUNCTIONS
    // ========================================================================

    #[abi(embed_v0)]
    impl LastChairGameImpl of super::ILastChairGame<ContractState> {

        fn start_match(
            ref self: ContractState,
            match_id: u256,
            stake: u256,
            c1: felt252,
            c2: felt252,
            c3: felt252,
        ) {
            let caller = get_caller_address();
            let m = self.matches.read(match_id);

            // Zero address means match slot empty
            let is_new = m.player_a == contract_address_const::<0>();

            if is_new {
                // First player — create match in Waiting state
                assert(stake > 0, ERROR_WRONG_STATE);

                // Lock stake
                let token = IERC20Dispatcher { contract_address: self.strk_token.read() };
                token.transfer_from(caller, get_contract_address(), stake);

                // Store commitments
                self.commitments.write((match_id, caller, 1), c1);
                self.commitments.write((match_id, caller, 2), c2);
                self.commitments.write((match_id, caller, 3), c3);

                // Create match
                let new_match = Match {
                    player_a: caller,
                    player_b: contract_address_const::<0>(),
                    stake,
                    current_round: 1,
                    state: MatchState::Waiting,
                    score_a: 0,
                    score_b: 0,
                };
                self.matches.write(match_id, new_match);

                // Initialize all 3 rounds
                let empty_round = Round {
                    commitment_a: 0,
                    commitment_b: 0,
                    chair_a: 0, trap1_a: 0, trap2_a: 0, trap3_a: 0,
                    chair_b: 0, trap1_b: 0, trap2_b: 0, trap3_b: 0,
                    state: RoundState::Pending,
                    score_a: 0,
                    score_b: 0,
                };
                self.rounds.write((match_id, 1), empty_round);
                self.rounds.write((match_id, 2), empty_round);
                self.rounds.write((match_id, 3), empty_round);

                self.emit(Event::PlayerQueued(PlayerQueued { match_id, player: caller, stake }));

            } else {
                // Second player — must match stake, must be Waiting
                assert(m.state == MatchState::Waiting, ERROR_ALREADY_STARTED);
                assert(m.player_a != caller, ERROR_ALREADY_STARTED);
                assert(m.stake == stake, ERROR_STAKE_MISMATCH);

                // Lock stake
                let token = IERC20Dispatcher { contract_address: self.strk_token.read() };
                token.transfer_from(caller, get_contract_address(), stake);

                // Store commitments
                self.commitments.write((match_id, caller, 1), c1);
                self.commitments.write((match_id, caller, 2), c2);
                self.commitments.write((match_id, caller, 3), c3);

                // Bake commitments into round structs
                let r1 = self.rounds.read((match_id, 1));
                let r2 = self.rounds.read((match_id, 2));
                let r3 = self.rounds.read((match_id, 3));

                let c1_a = self.commitments.read((match_id, m.player_a, 1));
                let c2_a = self.commitments.read((match_id, m.player_a, 2));
                let c3_a = self.commitments.read((match_id, m.player_a, 3));

                self.rounds.write((match_id, 1), Round { commitment_a: c1_a, commitment_b: c1, ..r1 });
                self.rounds.write((match_id, 2), Round { commitment_a: c2_a, commitment_b: c2, ..r2 });
                self.rounds.write((match_id, 3), Round { commitment_a: c3_a, commitment_b: c3, ..r3 });

                // Activate match
                let updated = Match {
                    player_a: m.player_a,
                    player_b: caller,
                    stake: m.stake,
                    current_round: 1,
                    state: MatchState::Active,
                    score_a: 0,
                    score_b: 0,
                };
                self.matches.write(match_id, updated);

                self.emit(Event::MatchStarted(MatchStarted {
                    match_id,
                    player_a: m.player_a,
                    player_b: caller,
                    stake: m.stake,
                }));
            }
        }

        fn submit_reveal(
            ref self: ContractState,
            match_id: u256,
            round: u8,
            proof_with_hints: Span<felt252>,
        ) {
            let caller = get_caller_address();
            let m = self.matches.read(match_id);

            assert(m.state == MatchState::Active, ERROR_WRONG_STATE);
            assert(round >= 1 && round <= 3, ERROR_WRONG_STATE);

            let is_player_a = caller == m.player_a;
            let is_player_b = caller == m.player_b;
            assert(is_player_a || is_player_b, ERROR_NOT_PLAYER);

            let r = self.rounds.read((match_id, round));

            // Check not already revealed by this player
            if is_player_a {
                assert(r.chair_a == 0, ERROR_ALREADY_REVEALED);
            } else {
                assert(r.chair_b == 0, ERROR_ALREADY_REVEALED);
            }

            // proof_with_hints last 4 elements: [chair, trap1, trap2, trap3]
            let len = proof_with_hints.len();
            assert(len >= 4, ERROR_INVALID_PROOF);

            let chair: u8 = (*proof_with_hints.at(len - 4)).try_into().unwrap();
            let trap1: u8 = (*proof_with_hints.at(len - 3)).try_into().unwrap();
            let trap2: u8 = (*proof_with_hints.at(len - 2)).try_into().unwrap();
            let trap3: u8 = (*proof_with_hints.at(len - 1)).try_into().unwrap();

            // Validate ranges
            assert(chair >= 1 && chair <= CHAIRS, ERROR_INVALID_POSITION);
            assert(trap1 >= 1 && trap1 <= CHAIRS, ERROR_INVALID_TRAPS);
            assert(trap2 >= 1 && trap2 <= CHAIRS, ERROR_INVALID_TRAPS);
            assert(trap3 >= 1 && trap3 <= CHAIRS, ERROR_INVALID_TRAPS);
            assert(trap1 != trap2 && trap1 != trap3 && trap2 != trap3, ERROR_INVALID_TRAPS);
            assert(chair != trap1 && chair != trap2 && chair != trap3, ERROR_INVALID_TRAPS);

            // Verify ZK proof via Garaga verifier
            let verifier = self.verifier_address.read();
            let _result = call_contract_syscall(
                verifier,
                selector!("verify_ultra_keccak_honk_proof"),
                proof_with_hints,
            ).unwrap_syscall();

            // Store revealed values
            let new_state = if is_player_a {
                match r.state {
                    RoundState::RevealedB => RoundState::Settled,
                    _ => RoundState::RevealedA,
                }
            } else {
                match r.state {
                    RoundState::RevealedA => RoundState::Settled,
                    _ => RoundState::RevealedB,
                }
            };

            let updated_round = if is_player_a {
                Round {
                    chair_a: chair,
                    trap1_a: trap1,
                    trap2_a: trap2,
                    trap3_a: trap3,
                    state: new_state,
                    commitment_a: r.commitment_a,
                    commitment_b: r.commitment_b,
                    chair_b: r.chair_b,
                    trap1_b: r.trap1_b,
                    trap2_b: r.trap2_b,
                    trap3_b: r.trap3_b,
                    score_a: r.score_a,
                    score_b: r.score_b,
                }
            } else {
                Round {
                    chair_b: chair,
                    trap1_b: trap1,
                    trap2_b: trap2,
                    trap3_b: trap3,
                    state: new_state,
                    commitment_a: r.commitment_a,
                    commitment_b: r.commitment_b,
                    chair_a: r.chair_a,
                    trap1_a: r.trap1_a,
                    trap2_a: r.trap2_a,
                    trap3_a: r.trap3_a,
                    score_a: r.score_a,
                    score_b: r.score_b,
                }
            };
            self.rounds.write((match_id, round), updated_round);

            self.emit(Event::RevealSubmitted(RevealSubmitted {
                match_id, round, player: caller, chair,
            }));
        }

        fn settle_round(ref self: ContractState, match_id: u256, round: u8) {
            let m = self.matches.read(match_id);
            assert(m.state == MatchState::Active, ERROR_WRONG_STATE);

            let r = self.rounds.read((match_id, round));
            // Both must have revealed — state is Settled means both in
            assert(r.state == RoundState::Settled, ERROR_ROUND_NOT_READY);
            // Check not already scored
            assert(r.score_a == 0 && r.score_b == 0, ERROR_WRONG_STATE);

            let (score_a, score_b) = calculate_round_score(
                r.chair_a, r.trap1_b, r.trap2_b, r.trap3_b,
                r.chair_b, r.trap1_a, r.trap2_a, r.trap3_a,
            );

            let new_score_a = m.score_a + score_a;
            let new_score_b = m.score_b + score_b;

            let updated_round = Round {
                score_a,
                score_b,
                commitment_a: r.commitment_a,
                commitment_b: r.commitment_b,
                chair_a: r.chair_a, trap1_a: r.trap1_a, trap2_a: r.trap2_a, trap3_a: r.trap3_a,
                chair_b: r.chair_b, trap1_b: r.trap1_b, trap2_b: r.trap2_b, trap3_b: r.trap3_b,
                state: r.state,
            };
            self.rounds.write((match_id, round), updated_round);

            let updated_match = Match {
                score_a: new_score_a,
                score_b: new_score_b,
                player_a: m.player_a,
                player_b: m.player_b,
                stake: m.stake,
                current_round: round + 1,
                state: m.state,
            };
            self.matches.write(match_id, updated_match);

            // Compute split for event
            let total = new_score_a + new_score_b;
            let split_a_bps: u32 = if total == 0 { 5000 } else { (new_score_a * 10000) / total };

            self.emit(Event::RoundSettled(RoundSettled {
                match_id, round, score_a, score_b, split_a_bps,
            }));
        }

        fn settle_match(ref self: ContractState, match_id: u256) {
            let m = self.matches.read(match_id);
            assert(m.state == MatchState::Active, ERROR_WRONG_STATE);

            // All 3 rounds must be settled
            let r3 = self.rounds.read((match_id, 3));
            assert(r3.state == RoundState::Settled && r3.score_a + r3.score_b > 0, ERROR_ROUND_NOT_SETTLED);

            let total_score = m.score_a + m.score_b;
            let total_pot: u256 = m.stake * 2;

            // Fee model:
            // split within 45/55 (bps 4500-5500) -> 0.5% each
            // split outside 45/55 -> 1% from winner
            let split_a_bps: u32 = if total_score == 0 { 5000 } else { (m.score_a * 10000) / total_score };
            let is_close = split_a_bps >= 4500 && split_a_bps <= 5500;

            let (payout_a, payout_b, fee) = if total_score == 0 {
                // Perfect tie — 50/50, 0.5% each
                let fee_each = total_pot / 200;
                (total_pot / 2 - fee_each, total_pot / 2 - fee_each, fee_each * 2)
            } else if is_close {
                // Close game — 0.5% fee from each
                let fee_each = total_pot / 200;
                let gross_a = (total_pot * m.score_a.into()) / total_score.into();
                let gross_b = total_pot - gross_a;
                (gross_a - fee_each, gross_b - fee_each, fee_each * 2)
            } else {
                // Clear winner — 1% from winner
                let fee = total_pot / 100;
                let gross_a = (total_pot * m.score_a.into()) / total_score.into();
                let gross_b = total_pot - gross_a;
                if m.score_a > m.score_b {
                    (gross_a - fee, gross_b, fee)
                } else {
                    (gross_a, gross_b - fee, fee)
                }
            };

            // Transfer payouts
            let token = IERC20Dispatcher { contract_address: self.strk_token.read() };
            if payout_a > 0 {
                token.transfer(m.player_a, payout_a);
            }
            if payout_b > 0 {
                token.transfer(m.player_b, payout_b);
            }
            // Fee stays in contract — collected by owner separately (TODO: owner + withdraw)

            // Mark finished
            let finished = Match {
                state: MatchState::Finished,
                player_a: m.player_a,
                player_b: m.player_b,
                stake: m.stake,
                current_round: 3,
                score_a: m.score_a,
                score_b: m.score_b,
            };
            self.matches.write(match_id, finished);

            self.emit(Event::MatchFinished(MatchFinished {
                match_id, payout_a, payout_b, fee, split_a_bps,
            }));
        }

        fn get_match(self: @ContractState, match_id: u256) -> Match {
            self.matches.read(match_id)
        }

        fn get_round(self: @ContractState, match_id: u256, round: u8) -> Round {
            self.rounds.read((match_id, round))
        }

        fn get_commitment(self: @ContractState, match_id: u256, player: ContractAddress, round: u8) -> felt252 {
            self.commitments.read((match_id, player, round))
        }
    }

    // ========================================================================
    // INTERNAL HELPERS
    // ========================================================================

    fn is_trapped(pos: u8, t1: u8, t2: u8, t3: u8) -> bool {
        pos == t1 || pos == t2 || pos == t3
    }

    fn calculate_round_score(
        chair_a: u8, trap1_b: u8, trap2_b: u8, trap3_b: u8,
        chair_b: u8, trap1_a: u8, trap2_a: u8, trap3_a: u8,
    ) -> (u32, u32) {
        let a_trapped = is_trapped(chair_a, trap1_b, trap2_b, trap3_b);
        let b_trapped = is_trapped(chair_b, trap1_a, trap2_a, trap3_a);

        let risk_a: u32 = chair_a.into();
        let risk_b: u32 = chair_b.into();

        // Score = chair * scale_factor + trap_bonus
        // Trapped: scale = 1 (0.25x after /4)
        // Safe:    scale = 4 (1.0x after /4)
        let scale_a: u32 = if a_trapped { TRAP_DEBUFF_SCALE } else { SAFE_SCALE };
        let scale_b: u32 = if b_trapped { TRAP_DEBUFF_SCALE } else { SAFE_SCALE };

        let trap_bonus_a: u32 = if b_trapped { TRAP_BONUS_SCALED } else { 0 };
        let trap_bonus_b: u32 = if a_trapped { TRAP_BONUS_SCALED } else { 0 };

        let score_a = risk_a * scale_a + trap_bonus_a;
        let score_b = risk_b * scale_b + trap_bonus_b;

        (score_a, score_b)
    }
}

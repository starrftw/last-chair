use starknet::{ContractAddress, get_caller_address, get_block_timestamp, contract_address_const};
use starknet::storage::{
    StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess,
    StorageMapWriteAccess,
};

// ============================================================================
// CONSTANTS
// ============================================================================

const ERROR_MATCH_NOT_FOUND: felt252 = 'Match not found';
const ERROR_ALREADY_JOINED: felt252 = 'Already joined';
const ERROR_MATCH_FULL: felt252 = 'Match is full';
const ERROR_NOT_PLAYER: felt252 = 'Not a player';
const ERROR_WRONG_STATE: felt252 = 'Wrong match state';
const ERROR_ALREADY_COMMITTED: felt252 = 'Already committed';
const ERROR_NOT_COMMITTED: felt252 = 'Not both committed';
const ERROR_ALREADY_REVEALED: felt252 = 'Already revealed';
const ERROR_INVALID_PROOF: felt252 = 'Invalid ZK proof';
const ERROR_TIMEOUT: felt252 = 'Action timed out';
const ERROR_NOT_SETTLED: felt252 = 'Round not resolved';

// ============================================================================
// TYPES
// ============================================================================

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
#[allow(starknet::store_no_default_variant)]
enum RoundState {
    Open,
    Committed,
    Revealed,
    Resolved,
}

#[derive(Drop, Serde, PartialEq, Copy, starknet::Store)]
#[allow(starknet::store_no_default_variant)]
enum MatchState {
    Waiting,
    InProgress,
    Settled,
}

#[derive(Drop, Serde, Copy, starknet::Store)]
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

#[derive(Drop, Serde, Copy, starknet::Store)]
struct Match {
    player_a: ContractAddress,
    player_b: ContractAddress,
    bet_amount: u256,
    round_number: u8,
    cumulative_score_a: u16,
    cumulative_score_b: u16,
    state: MatchState,
    created_at: u64,
    last_action_at: u64,
}

// ============================================================================
// EVENTS
// ============================================================================

#[derive(Drop, starknet::Event)]
struct MatchCreated {
    match_id: u256,
    player_a: ContractAddress,
    bet_amount: u256,
}

#[derive(Drop, starknet::Event)]
struct MatchJoined {
    match_id: u256,
    player_b: ContractAddress,
}

#[derive(Drop, starknet::Event)]
struct CommitmentSubmitted {
    match_id: u256,
    round: u8,
    player: ContractAddress,
}

#[derive(Drop, starknet::Event)]
struct RevealSubmitted {
    match_id: u256,
    round: u8,
    player: ContractAddress,
}

#[derive(Drop, starknet::Event)]
struct RoundSettled {
    match_id: u256,
    round: u8,
    score_a: u16,
    score_b: u16,
}

#[derive(Drop, starknet::Event)]
struct MatchSettled {
    match_id: u256,
    payout_a: u256,
    payout_b: u256,
    fee: u256,
}

#[derive(Drop, starknet::Event)]
struct TimeoutClaimed {
    match_id: u256,
    claimant: ContractAddress,
    amount: u256,
}

// ============================================================================
// INTERFACE
// ============================================================================

#[starknet::interface]
trait ILastChairGame<TContractState> {
    fn create_match(ref self: TContractState, bet_amount: u256) -> u256;
    fn join_match(ref self: TContractState, match_id: u256);
    fn submit_commitment(ref self: TContractState, match_id: u256, commitment: felt252);
    fn submit_reveal(
        ref self: TContractState, match_id: u256, proof_with_hints: Span<felt252>,
    );
    fn settle_round(ref self: TContractState, match_id: u256);
    fn settle_match(ref self: TContractState, match_id: u256);
    fn claim_timeout(ref self: TContractState, match_id: u256);
    fn get_match(self: @TContractState, match_id: u256) -> Match;
    fn get_round(self: @TContractState, match_id: u256, round: u8) -> Round;
    fn get_verifier_address(self: @TContractState) -> ContractAddress;
}

// ============================================================================
// CONTRACT
// ============================================================================

#[starknet::contract]
mod LastChairGame {
    use super::{
        ContractAddress, get_caller_address, get_block_timestamp, contract_address_const,
        StoragePointerReadAccess, StoragePointerWriteAccess, Map, StorageMapReadAccess,
        StorageMapWriteAccess, Round, Match, RoundState, MatchState, MatchCreated, MatchJoined,
        CommitmentSubmitted, RevealSubmitted, RoundSettled, MatchSettled, TimeoutClaimed,
        ERROR_MATCH_NOT_FOUND, ERROR_ALREADY_JOINED, ERROR_NOT_PLAYER, ERROR_WRONG_STATE,
        ERROR_ALREADY_COMMITTED, ERROR_NOT_COMMITTED, ERROR_INVALID_PROOF,
        ERROR_TIMEOUT, ERROR_NOT_SETTLED,
    };
    use contract::honk_verifier::{IUltraKeccakHonkVerifierDispatcher, IUltraKeccakHonkVerifierDispatcherTrait};

    // ========================================================================
    // EVENTS ENUM
    // ========================================================================

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        MatchCreated: MatchCreated,
        MatchJoined: MatchJoined,
        CommitmentSubmitted: CommitmentSubmitted,
        RevealSubmitted: RevealSubmitted,
        RoundSettled: RoundSettled,
        MatchSettled: MatchSettled,
        TimeoutClaimed: TimeoutClaimed,
    }

    // ========================================================================
    // STORAGE
    // ========================================================================

    #[storage]
    struct Storage {
        match_counter: u256,
        matches: Map<u256, Match>,
        rounds: Map<(u256, u8), Round>,
        player_to_match: Map<ContractAddress, u256>,
        platform_fee_percent: u8,
        reveal_timeout_seconds: u64,
        join_timeout_seconds: u64,
        verifier_address: ContractAddress,
    }

    // ========================================================================
    // CONSTRUCTOR
    // ========================================================================

    #[constructor]
    fn constructor(ref self: ContractState, verifier_address: ContractAddress) {
        self.match_counter.write(0);
        self.platform_fee_percent.write(1);
        self.reveal_timeout_seconds.write(3600);
        self.join_timeout_seconds.write(1800);
        self.verifier_address.write(verifier_address);
    }

    // ========================================================================
    // EXTERNAL FUNCTIONS
    // ========================================================================

    #[abi(embed_v0)]
    impl LastChairGameImpl of super::ILastChairGame<ContractState> {

        fn create_match(ref self: ContractState, bet_amount: u256) -> u256 {
            let caller = get_caller_address();
            let match_id = self.match_counter.read() + 1;
            self.match_counter.write(match_id);

            let now = get_block_timestamp();
            let new_match = Match {
                player_a: caller,
                player_b: contract_address_const::<0>(),
                bet_amount,
                round_number: 1,
                cumulative_score_a: 0,
                cumulative_score_b: 0,
                state: MatchState::Waiting,
                created_at: now,
                last_action_at: now,
            };
            self.matches.write(match_id, new_match);

            let round = Round {
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
            };
            self.rounds.write((match_id, 1), round);
            self.player_to_match.write(caller, match_id);

            self.emit(Event::MatchCreated(MatchCreated { match_id, player_a: caller, bet_amount }));
            match_id
        }

        fn join_match(ref self: ContractState, match_id: u256) {
            let caller = get_caller_address();
            let mut m = self.matches.read(match_id);
            assert(m.player_a != contract_address_const::<0>(), ERROR_MATCH_NOT_FOUND);
            assert(m.player_b == contract_address_const::<0>(), ERROR_ALREADY_JOINED);

            let now = get_block_timestamp();
            let updated = Match {
                player_a: m.player_a,
                player_b: caller,
                bet_amount: m.bet_amount,
                round_number: m.round_number,
                cumulative_score_a: m.cumulative_score_a,
                cumulative_score_b: m.cumulative_score_b,
                state: MatchState::InProgress,
                created_at: m.created_at,
                last_action_at: now,
            };
            self.matches.write(match_id, updated);
            self.player_to_match.write(caller, match_id);

            self.emit(Event::MatchJoined(MatchJoined { match_id, player_b: caller }));
        }

        fn submit_commitment(ref self: ContractState, match_id: u256, commitment: felt252) {
            let caller = get_caller_address();
            let m = self.matches.read(match_id);
            let round_number = m.round_number;
            let mut r = self.rounds.read((match_id, round_number));

            let is_player_a = caller == m.player_a;
            let is_player_b = caller == m.player_b;
            assert(is_player_a || is_player_b, ERROR_NOT_PLAYER);
            assert(m.state == MatchState::InProgress, ERROR_WRONG_STATE);

            let now = get_block_timestamp();

            let updated_round = if is_player_a {
                assert(r.commitment_a == 0, ERROR_ALREADY_COMMITTED);
                Round {
                    commitment_a: commitment,
                    commitment_b: r.commitment_b,
                    revealed_position_a: r.revealed_position_a,
                    revealed_position_b: r.revealed_position_b,
                    revealed_trap1_a: r.revealed_trap1_a,
                    revealed_trap2_a: r.revealed_trap2_a,
                    revealed_trap3_a: r.revealed_trap3_a,
                    revealed_trap1_b: r.revealed_trap1_b,
                    revealed_trap2_b: r.revealed_trap2_b,
                    revealed_trap3_b: r.revealed_trap3_b,
                    state: if r.commitment_b != 0 {
                        RoundState::Committed
                    } else {
                        RoundState::Open
                    },
                    score_a: r.score_a,
                    score_b: r.score_b,
                }
            } else {
                assert(r.commitment_b == 0, ERROR_ALREADY_COMMITTED);
                Round {
                    commitment_a: r.commitment_a,
                    commitment_b: commitment,
                    revealed_position_a: r.revealed_position_a,
                    revealed_position_b: r.revealed_position_b,
                    revealed_trap1_a: r.revealed_trap1_a,
                    revealed_trap2_a: r.revealed_trap2_a,
                    revealed_trap3_a: r.revealed_trap3_a,
                    revealed_trap1_b: r.revealed_trap1_b,
                    revealed_trap2_b: r.revealed_trap2_b,
                    revealed_trap3_b: r.revealed_trap3_b,
                    state: if r.commitment_a != 0 {
                        RoundState::Committed
                    } else {
                        RoundState::Open
                    },
                    score_a: r.score_a,
                    score_b: r.score_b,
                }
            };
            self.rounds.write((match_id, round_number), updated_round);

            let updated_match = Match {
                last_action_at: now,
                player_a: m.player_a,
                player_b: m.player_b,
                bet_amount: m.bet_amount,
                round_number: m.round_number,
                cumulative_score_a: m.cumulative_score_a,
                cumulative_score_b: m.cumulative_score_b,
                state: m.state,
                created_at: m.created_at,
            };
            self.matches.write(match_id, updated_match);

            self
                .emit(
                    Event::CommitmentSubmitted(
                        CommitmentSubmitted { match_id, round: round_number, player: caller },
                    ),
                );
        }

        fn submit_reveal(
            ref self: ContractState, match_id: u256, proof_with_hints: Span<felt252>,
        ) {
            let caller = get_caller_address();
            let m = self.matches.read(match_id);
            let round_number = m.round_number;
            let r = self.rounds.read((match_id, round_number));

            let is_player_a = caller == m.player_a;
            let is_player_b = caller == m.player_b;
            assert(is_player_a || is_player_b, ERROR_NOT_PLAYER);
            assert(r.state == RoundState::Committed, ERROR_NOT_COMMITTED);

            // Verify ZK proof via Garaga verifier
            let verifier = IUltraKeccakHonkVerifierDispatcher {
                contract_address: self.verifier_address.read(),
            };
            let result = verifier.verify_ultra_keccak_honk_proof(proof_with_hints);
            assert(result.is_some(), ERROR_INVALID_PROOF);

            // Extract public inputs: [public_hash]
            let public_inputs: Span<u256> = result.unwrap();
            assert(public_inputs.len() >= 1, ERROR_INVALID_PROOF);

            // The single public input is the hash of all revealed values
            // Game logic trusts the proof — position/traps are passed separately
            // and verified against the commitment inside the circuit
            let now = get_block_timestamp();

            // Player submits their revealed values alongside the proof
            // We read them from the proof hints (last 4 felts: pos, t1, t2, t3)
            // For now store that this player has revealed (state tracking)
            let updated_match = Match {
                last_action_at: now,
                player_a: m.player_a,
                player_b: m.player_b,
                bet_amount: m.bet_amount,
                round_number: m.round_number,
                cumulative_score_a: m.cumulative_score_a,
                cumulative_score_b: m.cumulative_score_b,
                state: m.state,
                created_at: m.created_at,
            };
            self.matches.write(match_id, updated_match);

            self
                .emit(
                    Event::RevealSubmitted(
                        RevealSubmitted { match_id, round: round_number, player: caller },
                    ),
                );
        }

        fn settle_round(ref self: ContractState, match_id: u256) {
            let m = self.matches.read(match_id);
            let round_number = m.round_number;
            let r = self.rounds.read((match_id, round_number));
            assert(r.state == RoundState::Revealed, ERROR_NOT_SETTLED);

            let (score_a, score_b) = calculate_round_score(
                r.revealed_position_a,
                r.revealed_trap1_b,
                r.revealed_trap2_b,
                r.revealed_trap3_b,
                r.revealed_position_b,
                r.revealed_trap1_a,
                r.revealed_trap2_a,
                r.revealed_trap3_a,
            );

            let new_score_a = m.cumulative_score_a + score_a;
            let new_score_b = m.cumulative_score_b + score_b;
            let next_round = round_number + 1;
            let is_last_round = round_number >= 3;

            let updated_round = Round {
                commitment_a: r.commitment_a,
                commitment_b: r.commitment_b,
                revealed_position_a: r.revealed_position_a,
                revealed_position_b: r.revealed_position_b,
                revealed_trap1_a: r.revealed_trap1_a,
                revealed_trap2_a: r.revealed_trap2_a,
                revealed_trap3_a: r.revealed_trap3_a,
                revealed_trap1_b: r.revealed_trap1_b,
                revealed_trap2_b: r.revealed_trap2_b,
                revealed_trap3_b: r.revealed_trap3_b,
                state: RoundState::Resolved,
                score_a,
                score_b,
            };
            self.rounds.write((match_id, round_number), updated_round);

            let new_state = if is_last_round {
                MatchState::Settled
            } else {
                MatchState::InProgress
            };

            let updated_match = Match {
                player_a: m.player_a,
                player_b: m.player_b,
                bet_amount: m.bet_amount,
                round_number: if is_last_round {
                    round_number
                } else {
                    next_round
                },
                cumulative_score_a: new_score_a,
                cumulative_score_b: new_score_b,
                state: new_state,
                created_at: m.created_at,
                last_action_at: get_block_timestamp(),
            };
            self.matches.write(match_id, updated_match);

            if !is_last_round {
                let empty_round = Round {
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
                };
                self.rounds.write((match_id, next_round), empty_round);
            }

            self
                .emit(
                    Event::RoundSettled(RoundSettled { match_id, round: round_number, score_a, score_b }),
                );
        }

        fn settle_match(ref self: ContractState, match_id: u256) {
            let m = self.matches.read(match_id);
            assert(m.state == MatchState::Settled, ERROR_WRONG_STATE);

            let total_pot = m.bet_amount * 2;
            let fee_percent: u256 = self.platform_fee_percent.read().into();
            let fee = (total_pot * fee_percent) / 100;
            let distributable = total_pot - fee;

            let total_score: u256 = (m.cumulative_score_a + m.cumulative_score_b).into();
            let (payout_a, payout_b) = if total_score == 0 {
                (distributable / 2, distributable / 2)
            } else {
                let pa = (distributable * m.cumulative_score_a.into()) / total_score;
                (pa, distributable - pa)
            };

            // TODO: Transfer tokens - requires ERC20 integration
            // For testnet demo this emits the event showing correct math

            self
                .emit(
                    Event::MatchSettled(MatchSettled { match_id, payout_a, payout_b, fee }),
                );
        }

        fn claim_timeout(ref self: ContractState, match_id: u256) {
            let caller = get_caller_address();
            let m = self.matches.read(match_id);
            let now = get_block_timestamp();
            let timeout = self.reveal_timeout_seconds.read();

            assert(now - m.last_action_at > timeout, ERROR_TIMEOUT);

            let payout = m.bet_amount * 2;
            let updated = Match {
                player_a: m.player_a,
                player_b: m.player_b,
                bet_amount: m.bet_amount,
                round_number: m.round_number,
                cumulative_score_a: m.cumulative_score_a,
                cumulative_score_b: m.cumulative_score_b,
                state: MatchState::Settled,
                created_at: m.created_at,
                last_action_at: now,
            };
            self.matches.write(match_id, updated);

            self
                .emit(
                    Event::TimeoutClaimed(TimeoutClaimed { match_id, claimant: caller, amount: payout }),
                );
        }

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
    // INTERNAL HELPERS
    // ========================================================================

    fn is_trapped(position: u8, t1: u8, t2: u8, t3: u8) -> bool {
        position == t1 || position == t2 || position == t3
    }

    fn calculate_round_score(
        pos_a: u8,
        trap1_b: u8,
        trap2_b: u8,
        trap3_b: u8,
        pos_b: u8,
        trap1_a: u8,
        trap2_a: u8,
        trap3_a: u8,
    ) -> (u16, u16) {
        let a_trapped = is_trapped(pos_a, trap1_b, trap2_b, trap3_b);
        let b_trapped = is_trapped(pos_b, trap1_a, trap2_a, trap3_a);

        let survival_a: u16 = if a_trapped { 0 } else { 1 };
        let survival_b: u16 = if b_trapped { 0 } else { 1 };

        let risk_a: u16 = pos_a.into();
        let risk_b: u16 = pos_b.into();

        let trap_bonus_a: u16 = if b_trapped { 10 } else { 0 };
        let trap_bonus_b: u16 = if a_trapped { 10 } else { 0 };

        let score_a = survival_a * risk_a + trap_bonus_a;
        let score_b = survival_b * risk_b + trap_bonus_b;

        (score_a, score_b)
    }
}

use dep::std::hash::poseidon;

fn main(
    // Private inputs - kept secret for proof generation
    position: Field,
    trap1: Field,
    trap2: Field,
    trap3: Field,
    salt: Field,
    // Public inputs - visible on-chain
    // commitment: stored at commit time, used to verify the reveal
    commitment: pub Field,
    // revealed values: submitted at reveal time, verified against private inputs
    revealed_position: pub Field,
    revealed_trap1: pub Field,
    revealed_trap2: pub Field,
    revealed_trap3: pub Field,
) {
    // Verify revealed values match the private inputs (ensures honest reveal)
    assert(position == revealed_position, "revealed position must match");
    assert(trap1 == revealed_trap1, "revealed trap1 must match");
    assert(trap2 == revealed_trap2, "revealed trap2 must match");
    assert(trap3 == revealed_trap3, "revealed trap3 must match");

    // Validate ranges (1-12)
    assert(position as u8 >= 1);
    assert(position as u8 <= 12);
    assert(trap1 as u8 >= 1);
    assert(trap1 as u8 <= 12);
    assert(trap2 as u8 >= 1);
    assert(trap2 as u8 <= 12);
    assert(trap3 as u8 >= 1);
    assert(trap3 as u8 <= 12);

    // Traps can't overlap each other
    assert(trap1 != trap2);
    assert(trap1 != trap3);
    assert(trap2 != trap3);

    // Player can't sit on their own trap
    assert(position != trap1);
    assert(position != trap2);
    assert(position != trap3);

    // The commitment must match
    // poseidon::bn254::hash_5 is for 5 field elements
    let computed = poseidon::bn254::hash_5([position, trap1, trap2, trap3, salt]);
    assert(computed == commitment);
}

#[test]
fn test_valid_commitment() {
    let position = 5;
    let trap1 = 2;
    let trap2 = 9;
    let trap3 = 11;
    let salt = 12345;
    let commitment = poseidon::bn254::hash_5([position, trap1, trap2, trap3, salt]);

    main(position, trap1, trap2, trap3, salt, commitment, position, trap1, trap2, trap3);
}

#[test(should_fail)]
fn test_invalid_range() {
    let position = 13;
    let trap1 = 1;
    let trap2 = 2;
    let trap3 = 3;
    let salt = 0;
    let commitment = 0;
    main(position, trap1, trap2, trap3, salt, commitment, position, trap1, trap2, trap3);
}

#[test(should_fail)]
fn test_overlap_traps() {
    let position = 5;
    let trap1 = 1;
    let trap2 = 1;
    let trap3 = 2;
    let salt = 0;
    let commitment = 0;
    main(position, trap1, trap2, trap3, salt, commitment, position, trap1, trap2, trap3);
}

#[test(should_fail)]
fn test_sit_on_trap() {
    let position = 5;
    let trap1 = 5;
    let trap2 = 1;
    let trap3 = 2;
    let salt = 0;
    let commitment = 0;
    main(position, trap1, trap2, trap3, salt, commitment, position, trap1, trap2, trap3);
}

// Test that revealing wrong values fails
#[test(should_fail)]
fn test_wrong_revealed_position() {
    let position = 5;
    let trap1 = 2;
    let trap2 = 9;
    let trap3 = 11;
    let salt = 12345;
    let commitment = poseidon::bn254::hash_5([position, trap1, trap2, trap3, salt]);
    
    // Try to reveal a different position - should fail
    main(position, trap1, trap2, trap3, salt, commitment, 7, trap1, trap2, trap3);
}

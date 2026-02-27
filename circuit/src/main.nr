fn main(
    position: Field,
    trap1: Field,
    trap2: Field,
    trap3: Field,
    salt: Field,
    revealed_position: Field,
    revealed_trap1: Field,
    revealed_trap2: Field,
    revealed_trap3: Field,
    public_hash: pub Field,
) {
    let pos = position as u64;
    let t1 = trap1 as u64;
    let t2 = trap2 as u64;
    let t3 = trap3 as u64;

    assert(pos >= 1); assert(pos <= 12);
    assert(t1 >= 1); assert(t1 <= 12);
    assert(t2 >= 1); assert(t2 <= 12);
    assert(t3 >= 1); assert(t3 <= 12);

    assert(trap1 != trap2);
    assert(trap1 != trap3);
    assert(trap2 != trap3);

    assert(position != trap1);
    assert(position != trap2);
    assert(position != trap3);

    assert(position == revealed_position);
    assert(trap1 == revealed_trap1);
    assert(trap2 == revealed_trap2);
    assert(trap3 == revealed_trap3);

    let commitment = std::hash::pedersen_hash([position, trap1, trap2, trap3, salt]);
    let computed_public = std::hash::pedersen_hash([
        commitment,
        revealed_position,
        revealed_trap1,
        revealed_trap2,
        revealed_trap3
    ]);
    assert(computed_public == public_hash);
}
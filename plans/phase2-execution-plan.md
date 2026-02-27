# Phase 2 Execution Plan - Noir ZK Circuit

## Current Status
- Circuit drafted at [`circuit/src/main.nr`](circuit/src/main.nr:1)
- Contains all required constraints:
  - Range validation (1-12)
  - No duplicate traps
  - No self-trapping
  - Poseidon hash commitment verification

## Execution Steps

### Step 1: Install nargo (Noir Compiler)
```bash
# In WSL Ubuntu
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
noirup
```

### Step 2: Compile Noir Circuit
```bash
cd circuit
nargo compile
```

### Step 3: Run Circuit Tests
```bash
cd circuit
nargo test
```

### Step 4: Generate Proving/Verification Keys
```bash
cd circuit
nargo codegen-verifier
```

### Step 5: Install Barretenberg for Local Proof Generation
```bash
# Install bb.js for in-browser proving
npm install @aztec/bb.js @noir-lang/noir_js
```

### Step 6: Test Local Proof Generation
Create a test script that:
1. Takes position, trap1, trap2, trap3, salt as input
2. Computes Poseidon hash
3. Generates proof with Barretenberg
4. Verifies proof

### Step 7: Generate Garaga Cairo Verifier
```bash
# Generate Cairo verifier from compiled circuit
garaga gen --system ultra_keccak_zk_honk --vk circuit/target/vk.bin
```

### Step 8: Compile Verifier Contract
```bash
cd contract
scarb build
```

## Prerequisites in WSL
- Rust installed
- Cairo/Scarb installed
- Node.js for bb.js

## Deliverables
- [x] circuit/src/main.nr - Noir circuit (drafted)
- [ ] Compile with nargo compile
- [ ] Local proof generation + verification with Barretenberg
- [ ] Garaga Cairo verifier generated
- [ ] Verifier contract compiles with scarb build

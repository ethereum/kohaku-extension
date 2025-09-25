# Circuits

---

This document defines the technical requirements and the logic to be implemented for the circuits of the private transfer system. It serves as a guide for developers to implement the circuits in a consistent and secure manner.

## 1. Circuit Architecture

The system uses a commitment scheme to represent user balances as private "notes", which are stored in a Merkle tree. The circuits are the core engine that validates every transaction by checking the integrity of the user's inputs.

The circuits specified herein are the cryptographic core of this system. They should be implemented to correctly and securely enforce the protocol's rules.

### System Invariants

The circuit architecture upholds the following fundamental invariants of the system:

1. **Confidentiality:** The values and recipients of a private transaction remain hidden from public observers.
2. **Value Conservation:** The total value within the system is conserved. Value cannot be created or destroyed, only moved between private notes or publicly withdrawn.
3. **Ownership Integrity:** Only the legitimate owner of a note, possessing the correct private keys and secrets, can authorize its spending.
4. **Double-Spend Prevention:** Each private note is uniquely nullified upon spending, making it impossible to use more than once. The circuit will be in charge of generating this nullifier hash.

### Circuit Architecture

The system's architecture is composed of two types of components: **Main Circuits**, which will define complete user-facing operations, and **Helper Templates**, which will be reusable, modular building blocks used within the main circuits.

### Main Circuit

This is the top-level circuit for which a user will generate a proof.

1. **`Transact`:** This is the main circuit template for all value operations. It is designed to be instantiated for different numbers of inputs (e.g., 1 or 2), creating specialized circuits for different transaction types. For the MVP, we will instantiate two versions:
    - `Transact(maxDepth, 1)` for 1-input, 2-output transactions.
    - `Transact(maxDepth, 2)` for 2-input, 2-output transactions.

This approach provides significant efficiency gains for the common 1-input case and simplifies the circuit logic compared to a single, universal circuit using dummy notes.

### Helpers

These are reusable components designed to encapsulate common logic.

1. **`Note Commitment`:** This is the atomic unit of the system. It computes a cryptographic hash (commitment) for a transaction note to conceal its content.
2. **`Key Registry`:** This template manages user identities by computing a unique leaf for a user's key set. It is used by the `Transact` circuit to verify the owner's registration.
3. `Lean Incremental Merkle Proof Verification`**:** This is a general-purpose component. It proves that a specific piece of data (a leaf) is included in a Merkle tree without revealing the entire tree.

### Specified Cryptographic Primitives

- **Hash Function:** All cryptographic hashes within the circuits are implemented using the **Poseidon** hash function.

---

## 2. Detailed Circuit Specifications

### 2.1. `Note Commitment`

### 2.1.1. Purpose

This template computes a unique, cryptographic commitment for a "note". The commitment conceals the note's details (value, recipient, etc.) while allowing it to be uniquely stored and referenced in a Merkle tree.

### 2.1.2. Signals

| Name | Type | Description |
| --- | --- | --- |
| `addressHash` | input | A pre-computed hash of the recipient's EVM address and a secret. |
| `tokenId` | input | A unique ID for the type of token. |
| `value` | input | The value or amount of tokens in the note. |
| `commitment` | output | The computed commitment of the note. |

### 2.1.3. Logic & Constraints

The commitment calculation is performed as follows:

- `commitment <== Poseidon(addressHash, tokenId, value)`

---

### 2.2. `Key Registry`

### 2.2.1. Purpose

This template recomputes a unique "leaf" for a user's key registry from private inputs. The resulting leaf is used to perform a Merkle inclusion proof against the claimed registry root, verifying the user's registration in the system without revealing their private keys. The circuit combines the user's public address with commitments of their private keys.

The `privateRevocableKey` is included to support a potential on-chain key rotation or revocation mechanism. By allowing this key to be changed at the contract level, older key registry leaves can be invalidated in the event of a key compromise.

### 2.2.2. Signals

| Name | Type | Description |
| --- | --- | --- |
| `evmAddress` | input | The user's public EVM address. |
| `privateNullifyingKey` | input | The user's private nullifying key. |
| `privateRevocableKey` | input | The user's private revocable key. |
| `keyRegistryLeaf` | output | The computed leaf for the key registry Merkle tree. |

### 2.2.3. Logic & Constraints

The leaf calculation follows these steps:

1. **Compute EVM Address Commitment:**
    - `evmAddressCommitment = Poseidon(evmAddress)`
2. **Compute Nullifying Key Commitment:**
    - `nullifyingKeyCommitment = Poseidon(privateNullifyingKey)`
3. **Compute Revocable Key Commitment:**
    - `revocableKeyCommitment = Poseidon(privateRevocableKey)`
4. **Compute Final Leaf:**
    - The `keyRegistryLeaf` is computed from the combination of the three previously computed hashes.
    - **Constraint:** `keyRegistryLeaf === Poseidon(evmAddressCommitment, nullifyingKeyCommitment, revocableKeyCommitment)`

---

### 2.3. `Lean Incremental Merkle Proof Verification`

### 2.3.1. Purpose

This circuit verifies that a given `leaf` exists at a specific `leafIndex` in a Merkle tree with a known `root`. The circuit can handle incomplete trees (i.e., trees where some branches are empty).

### 2.3.2. Parameters

| Name | Description |
| --- | --- |
| `maxDepth` | The maximum depth of the Merkle tree that the circuit supports. Choose per deployment; ensure the bit-width used in depth checks accommodates this value (e.g., 6 bits supports up to 63). |

### 2.3.3. Signals

| Name | Type | Description |
| --- | --- | --- |
| `leaf` | input | The leaf whose membership is to be proven. |
| `leafIndex` | input | The index of the leaf in the tree (0-indexed from the left). |
| `siblings` | input array | An array of length `maxDepth` containing the sibling nodes along the path. |
| `actualDepth` | input | The actual depth of the tree (the level at which the rightmost leaf resides). |
| `root` | output | The computed root of the tree. |

### 2.3.4. Logic & Constraints

The verification implements the following process:

1. **Depth Validation:**
    - It is ensured that the provided `actualDepth` is not greater than the `maxDepth` supported by the circuit.
    - **Constraint:** `actualDepth <= maxDepth`
2. **Path Computation:**
    - The `leafIndex` is converted into a binary path of length `maxDepth`. Each bit in the path represents the position (left or right) at a level of the tree.
3. **Iterative Hash Computation:**
    - The process starts with the `leaf` as the first node.
    - For each level `i` from 0 to `maxDepth - 1`:
    a. The current node is combined with the corresponding sibling node `siblings[i]`.
    b. The order of the two nodes for the hash (`[node, sibling]` or `[sibling, node]`) is determined by the `i`th bit of the path computed in step 2.
    c. The two nodes are hashed using `Poseidon` to compute the parent node for the next level.
    d. **Handling Empty Siblings:** If a `siblings[i]` has a value of 0, signaling an empty branch, the parent node for the next level takes the value of the current node. Otherwise, it takes the value of the hash computed in the previous step.
4. **Output Assignment:**
    - The node computed at the end of the iterative process is the root of the tree.

---

### 2.4. `Transact`

### 2.4.1. Purpose

The `Transact` template validates all value-moving operations. It is a configurable circuit that can be instantiated to handle transactions with either 1 or 2 input notes, and it always produces 2 output notes (which can be zero-value notes).

This templated approach was chosen over the alternative of a single, universal 2-input circuit that would handle 1-input cases by requiring a "dummy" input note (see Appendix 5.1). This design is superior for two primary reasons:

1. **Efficiency:** The 1-input flow is expected to be a common use case. A specialized circuit for this scenario is significantly more efficient than a universal circuit that must always process two inputs, even if one is a dummy.
    - `transact1Input`: **6,190 constraints**
    - `transact2Input`: **8,939 constraints**
2. **Simplicity:** Eliminating the complex conditional logic required to securely handle dummy input notes makes the circuit code simpler, easier to audit, and less prone to bugs.

The circuit is responsible for enforcing the system's core invariants, permitting any combination of private transfers and public withdrawals that satisfies the value conservation rule.

### 2.4.2. Parameters

| Name | Description |
| --- | --- |
| `maxDepth` | The maximum depth of the Merkle tree that the circuit must support. |
| `numInputs` | The number of real input notes for the specific circuit instance (must be 1 or 2). |

### 2.4.3. Signals

### Public Signals

| Name | Type | Description |
| --- | --- | --- |
| `merkleRoot` | input | The known root of the note commitment Merkle tree. |
| `keyRegistryRoot` | input | The known root of the key registry Merkle tree. |
| `commitmentsOut` | output array | An array of size 2 containing the commitments of the new output notes. |
| `nullifierHashes` | output array | An array of size `numInputs` containing the nullifiers of the spent input notes. |
| `tokenIdOut` | input | The public token ID for the output notes. The circuit constrains this value against the private token ID. |
| `amountOut` | input | The value to be publicly withdrawn. If 0, the operation is a private transfer. |
| `context` | input | A pre-computed cryptographic commitment to the withdrawal details. |

### Private Signals

| Name | Type | Description |
| --- | --- | --- |
| `ownerAddress` | input | The EVM address of the input notes' owner. |
| `privateNullifyingKey` | input | The owner's private nullifying key. |
| `privateRevocableKey` | input | The owner's private revocable key. |
| `inputNoteSecrets` | input array | [`numInputs`] The secrets for each of the input notes. Used to compute `addressHash`. |
| `inputValues` | input array | [`numInputs`] Values of the input notes. |
| `outputAddressHashes` | input array | [2] Pre-computed address hashes for the two output notes. |
| `outputValues` | input array | [2] Values of the two output notes. |
| `transactionTokenId` | input | The single token ID used for all notes in the transaction. |
| `inputSiblings` | input 2D-array | [`numInputs`][`maxDepth`] Merkle paths for the input notes. |
| `inputIndices` | input array | [`numInputs`] Indices of the input notes in the Merkle tree. |
| `inputTreeDepths` | input array | [`numInputs`] The tree depths for the Merkle proofs of the input notes. |
| `keyRegistrySiblings` | input array | [`maxDepth`] Merkle path for the sender's key registry entry. |
| `keyRegistryIndex` | input | The owner's index in the key registry Merkle tree. |
| `keyRegistryTreeDepth` | input | The tree depth for the key registry Merkle proof. |

### 2.4.4. Logic & Constraints

The validation within the circuit strictly follows these steps:

**1. Security Constraint Enforcement**

- The circuit enforces the critical security constraints outlined in Section 2.5. This includes:
    - **Value Overflow Prevention:** Constraining all value signals to a safe bit-length.
    - **Public Input Malleability:** Applying a non-linear constraint to the `context` signal.

**2. Token ID Verification**

- The private `transactionTokenId` is used to compute the input note commitments for the Merkle proofs, implicitly verifying that the user is spending notes of that token type.
- The public input `tokenIdOut` is constrained based on `amountOut`:
    - For transaction with withdrawals (`amountOut > 0`), `tokenIdOut` must equal the private `transactionTokenId`. This ensures the contract processes the withdrawal for the correct token.
    - For pure transfers (`amountOut = 0`), `tokenIdOut` can be any value (e.g., an obfuscated or dummy value), preserving token privacy.
- This logic is enforced by the constraint: `amountOut * (tokenIdOut - transactionTokenId) === 0`.

**3. User Identity Verification**

- First, the owner's `keyRegistryLeaf` is computed using the `Key Registry` template logic (see Section 2.2).
- Next, a Merkle inclusion proof for this `keyRegistryLeaf` is performed using the `Lean Incremental Merkle Proof Verification` template logic (see Section 2.3).
- **Constraint:** The root computed from this proof matches the public `keyRegistryRoot` signal.

**4. Input Note Processing (for each of the `numInputs` inputs)**

- **a. Address Hash Computation:** The `addressHash` for each input note is computed inside the circuit.
    - `addressHash <== Poseidon(ownerAddress, inputNoteSecrets[i])`
- **b. Note Commitment Computation:** The commitment for each input note is computed using the `Note Commitment` template. It takes the `addressHash` computed in the previous step, along with the `inputValues[i]` and the single `transactionTokenId`.
- **c. Merkle Proof Verification:** An unconditional Merkle inclusion proof for the commitment computed in the previous step is performed.
    - **Constraint:** The root computed from this proof must match the public `merkleRoot` signal.
- **d. Nullifier Computation and Assignment:** The nullifier for each input note is computed using the `privateNullifyingKey` and the note commitment re-calculated in step 4.b. The result is assigned to the corresponding `nullifierHashes[i]` output signal.

**5. Output Note Processing (for each of the 2 outputs)**

- **a. Note Commitment Computation:** The commitment for each output note (including zero-value dummy notes) is computed using the `Note Commitment` template with the pre-computed `outputAddressHashes[i]`, the `outputValues[i]`, and the `transactionTokenId`.
- **b. Commitment Assignment:** The computed commitment is always emitted in `commitmentsOut[i]`. The smart contract should insert **both** commitments into the Merkle tree, guaranteeing that every transaction has exactly two new leaves.

**6. Value Conservation**

- The sum of all `inputValues` and `outputValues` is calculated. The input sum depends on `numInputs`.
- **Constraint:** The sums adhere to the following equation: `sum(inputValues)` === `sum(outputValues) + amountOut`. This single constraint enforces the conservation of value.

**7. Withdrawal State Enforcement**

- The `context` signal is a public input pre-computed by the client to cryptographically bind the proof to public transaction parameters, such as the recipient and amount for a withdrawal. This binding must be checked by the on-chain verifier contract.

---

### 2.5. Security Considerations

For the circuits to be secure, several specific constraints are enforced. These are not general system invariants but rather concrete implementation requirements to prevent specific attacks.

- **Public Input Malleability:** The `context` signal is a public input that is pre-computed by the client. Its binding to the withdrawal details is checked by the on-chain contract. To prevent malleability attacks on the proof itself, this public input is constrained non-linearly within the circuit.
    - **Constraint:** `_ = context * context`
- **Value Overflow Prevention:** All signals representing a token value (`inputValues`, `outputValues`, `amountOut`) must be constrained to a safe bit-length (e.g., 128 bits). This is a critical check to prevent overflow attacks where a user could exploit the properties of finite field arithmetic to create value. Without this check, a user could craft output values that appear negative in the field, allowing them to bypass the value conservation constraint.
    - **Constraint:** For each value signal, use a range check component (e.g., `Num2Bits(128)`) to ensure the value fits within the expected bit range.
- **Client-Side Responsibility: Unique Dummy Output Notes.** The protocol requires that every transaction produces two new output commitments. In cases where only one new note is needed, the second is a zero-value "dummy" note. The circuit takes the `outputAddressHash` for this dummy note directly as a private input. It is therefore a critical client-side responsibility to ensure this hash is unique for every dummy note created.
    - **Rationale:** If a client were to use a constant `outputAddressHash`, every dummy note created by a user would have the same commitment. This would cause subsequent transactions to fail, either from the Merkle tree rejecting a duplicate leaf insertion or from a `NullifierAlreadySpent` error if a user tries to spend a second dummy note.
    - **Implementation:** To ensure the dummy note is spendable, the client must generate the `outputAddressHash` from a secret it controls. The correct method is to generate a fresh, random `noteSecret` and compute `outputAddressHash = Poseidon(ownerAddress, noteSecret)`.
- **Security Assumption: Initial Keystore Root.** The circuit does not prevent a user from generating a proof against the initial, empty `Keystore` root (typically `0`). The on-chain verifier contract is responsible for preventing this entire class of attacks by explicitly rejecting any transaction where the provided `keyRegistryRoot` is the known initial-state root. This ensures transactions are only valid against a "live" `Keystore` with at least one registered user.

---

## 4. Appendix: Circom Pseudocode

This section provides non-functional Circom-style pseudocode to illustrate the logic described in this specification.

### 4.1. Template: `NoteCommitment`

```
template NoteCommitment() {
    // Signals
    signal input addressHash;
    signal input tokenId;
    signal input value;
    signal output commitment;

    // Logic
    component commitmentHasher = Poseidon(3);
    commitmentHasher.inputs[0] <== addressHash;
    commitmentHasher.inputs[1] <== tokenId;
    commitmentHasher.inputs[2] <== value;
    commitment <== commitmentHasher.out;
}

```

### 4.2. Template: `KeyRegistry`

```
template KeyRegistry() {
    // Signals
    signal input evmAddress;
    signal input privateNullifyingKey;
    signal input privateRevocableKey;
    signal output keyRegistryLeaf;

    // Logic
    component evmAddressHasher = Poseidon(1);
    evmAddressHasher.inputs[0] <== evmAddress;
    signal evmAddressCommitment <== evmAddressHasher.out;

    component nullifyingKeyHasher = Poseidon(1);
    nullifyingKeyHasher.inputs[0] <== privateNullifyingKey;
    signal nullifyingKeyCommitment <== nullifyingKeyHasher.out;

    component revocableKeyHasher = Poseidon(1);
    revocableKeyHasher.inputs[0] <== privateRevocableKey;
    signal revocableKeyCommitment <== revocableKeyHasher.out;

    component leafHasher = Poseidon(3);
    leafHasher.inputs[0] <== evmAddressCommitment;
    leafHasher.inputs[1] <== nullifyingKeyCommitment;
    leafHasher.inputs[2] <== revocableKeyCommitment;
    keyRegistryLeaf <== leafHasher.out;
}

```

### 4.3. Template: `MerkleTreeInclusionProof`

```
// Note: Assumes use of circomlib components like Num2Bits, IsZero, MultiMux1, LessEqThan
// This template is illustrative. The actual implementation is `LeanIMTInclusionProof.circom`.
template MerkleTreeInclusionProof(maxDepth) {
    // Signals
    signal input leaf;
    signal input leafIndex;
    signal input siblings[maxDepth];
    signal input actualDepth;
    signal output root;

    // Logic
    // 1. Depth Validation
    component depthCheck = LessEqThan(6); // Example: 6 bits supports up to 63; choose bit-width to match selected maxDepth
    depthCheck.in[0] <== actualDepth;
    depthCheck.in[1] <== maxDepth;
    depthCheck.out === 1;

    // 2. Path Computation
    component index2bits = Num2Bits(maxDepth);
    index2bits.in <== leafIndex;
    signal path[maxDepth] <== index2bits.out;

    // 3. Iterative Hash Computation
    signal computedNode[maxDepth + 1];
    computedNode[0] <== leaf;

    for (var i = 0; i < maxDepth; i++) {
        // Prepare node pairs for hashing
        var children[2][2] = [[computedNode[i], siblings[i]], [siblings[i], computedNode[i]]];
        component mux = MultiMux1(2);
        mux.c <== children;
        mux.s <== path[i];

        // Hash the nodes
        component hasher = Poseidon(2);
        hasher.inputs <== mux.out;

        // Check if sibling is empty (zero)
        component isSiblingEmpty = IsZero();
        isSiblingEmpty.in <== siblings[i];

        // If sibling is 0, propagate the current node. Otherwise, use the new hash.
        // This follows the LeanIMT design where a node with one child has the same value.
        computedNode[i + 1] <== (computedNode[i] - hasher.out) * isSiblingEmpty.out + hasher.out;
    }

    // 4. Output Assignment
    root <== computedNode[maxDepth];
}

```

### 4.4. Template: `Transact`

```
template Transact(maxDepth, numInputs) {
    // Ensure numInputs is either 1 or 2
    assert(numInputs == 1 || numInputs == 2);

    //////////////////////// PUBLIC SIGNALS ////////////////////////

    signal input merkleRoot;                    // The known root of the note commitment Merkle tree
    signal input keyRegistryRoot;               // The known root of the key registry Merkle tree
    signal input tokenIdOut;                    // The public token ID for the output notes (abstract for private transfer)
    signal input amountOut;                     // The value to be publicly withdrawn (0 = private transfer)
    signal input context;                       // Pre-computed cryptographic commitment to withdrawal details

    signal output commitmentsOut[2];            // Array containing the commitments of the new output notes
    signal output nullifierHashes[numInputs];   // Array containing the nullifiers of the spent input notes

    /////////////////////// PRIVATE SIGNALS ///////////////////////

    signal input ownerAddress;                  // The EVM address of the input notes' owner
    signal input privateNullifyingKey;          // The owner's private nullifying key
    signal input privateRevocableKey;           // The owner's private revocable key

    signal input inputNoteSecrets[numInputs];   // Note secrets for the input notes
    signal input inputValues[numInputs];        // Values of the input notes

    signal input outputAddressHashes[2];        // Pre-computed address hashes for the two output notes
    signal input outputValues[2];               // Values of the two output notes

    signal input transactionTokenId;            // The single token ID used for all notes in the transaction

    signal input inputSiblings[numInputs][maxDepth]; // Merkle paths for the input notes
    signal input inputIndices[numInputs];       // Indices of the input notes in the Merkle tree
    signal input inputTreeDepths[numInputs];    // The tree depths for the Merkle proofs of the input notes

    signal input keyRegistrySiblings[maxDepth]; // Merkle path for the sender's key registry entry
    signal input keyRegistryIndex;              // The owner's index in the key registry Merkle tree
    signal input keyRegistryTreeDepth;          // The tree depth for the key registry Merkle proof

    /////////////////// INTERNAL SIGNALS & COMPONENTS ///////////////////

    signal inputAddressHashes[numInputs];       // Computed address hashes for input notes
    signal totalInputValue;                     // Sum of input note values
    signal totalOutputValue;                    // Sum of output note values

    // Components arrays (must be declared outside loops)
    component inputAddressHashers[numInputs];   // Components for computing input address hashes
    component inputCommitments[numInputs];      // Components for input note commitments
    component inputProofs[numInputs];           // Components for input Merkle proofs
    component nullifiers[numInputs];            // Components for nullifier generation
    component outputCommitments[2];             // Components for output note commitments
    component inputValueRanges[numInputs];      // Range checks for input values
    component outputValueRanges[2];             // Range checks for output values

    /////////////////////// LOGIC & CONSTRAINTS ///////////////////////

    // === 1. Security Constraint Enforcement ===

    // Range checks for all value signals to prevent overflow
    component amountOutRange = Num2Bits(128);
    amountOutRange.in <== amountOut;

    for (var i = 0; i < numInputs; i++) {
        inputValueRanges[i] = Num2Bits(128);
        inputValueRanges[i].in <== inputValues[i];
    }
    for (var i = 0; i < 2; i++) {
        outputValueRanges[i] = Num2Bits(128);
        outputValueRanges[i].in <== outputValues[i];
    }

    // Non-malleability constraint for context (prevents proof malleability)
    signal contextSquared <== context * context;

    // === 2. Token ID Verification ===

    // For withdrawals (amountOut > 0): tokenIdOut must equal transactionTokenId
    // For transfers (amountOut = 0): tokenIdOut can be any value (privacy preservation)
    amountOut * (tokenIdOut - transactionTokenId) === 0;

    // === 3. User Identity Verification ===

    // Compute the owner's key registry leaf
    component keyRegistry = KeyRegistry();
    keyRegistry.evmAddress <== ownerAddress;
    keyRegistry.privateNullifyingKey <== privateNullifyingKey;
    keyRegistry.privateRevocableKey <== privateRevocableKey;

    // Verify key registry leaf inclusion in key registry tree
    component keyRegistryProof = MerkleTreeInclusionProof(maxDepth);
    keyRegistryProof.leaf <== keyRegistry.keyRegistryLeaf;
    keyRegistryProof.leafIndex <== keyRegistryIndex;
    keyRegistryProof.siblings <== keyRegistrySiblings;
    keyRegistryProof.actualDepth <== keyRegistryTreeDepth;
    keyRegistryProof.root === keyRegistryRoot;

    // === 4. Input Note Processing (for each input note) ===

    for (var i = 0; i < numInputs; i++) {
        // 4a. Address Hash Computation
        // Compute addressHash = Poseidon(ownerAddress, noteSecret)
        inputAddressHashers[i] = Poseidon(2);
        inputAddressHashers[i].inputs[0] <== ownerAddress;
        inputAddressHashers[i].inputs[1] <== inputNoteSecrets[i];
        inputAddressHashes[i] <== inputAddressHashers[i].out;

        // 4b. Note Commitment Computation
        inputCommitments[i] = NoteCommitment();
        inputCommitments[i].addressHash <== inputAddressHashes[i];
        inputCommitments[i].tokenId <== transactionTokenId;
        inputCommitments[i].value <== inputValues[i];

        // 4c. Merkle Proof Verification
        inputProofs[i] = MerkleTreeInclusionProof(maxDepth);
        inputProofs[i].leaf <== inputCommitments[i].commitment;
        inputProofs[i].leafIndex <== inputIndices[i];
        inputProofs[i].siblings <== inputSiblings[i];
        inputProofs[i].actualDepth <== inputTreeDepths[i];
        inputProofs[i].root === merkleRoot;

        // 4d. Nullifier Computation and Assignment
        nullifiers[i] = Poseidon(2);
        nullifiers[i].inputs[0] <== privateNullifyingKey;
        nullifiers[i].inputs[1] <== inputCommitments[i].commitment;
        nullifierHashes[i] <== nullifiers[i].out;
    }

    // === 5. Output Note Processing (for each of the 2 outputs) ===

    for (var i = 0; i < 2; i++) {
        // 5a. Note Commitment Computation & Assignment
        outputCommitments[i] = NoteCommitment();
        outputCommitments[i].addressHash <== outputAddressHashes[i];
        outputCommitments[i].tokenId <== transactionTokenId;
        outputCommitments[i].value <== outputValues[i];

        // Always emit commitment (even for zero-value dummy notes)
        commitmentsOut[i] <== outputCommitments[i].commitment;
    }

    // === 6. Value Conservation ===

    // Calculate total input value (sum depends on numInputs)
    if (numInputs == 1) {
        totalInputValue <== inputValues[0];
    } else { // numInputs == 2
        totalInputValue <== inputValues[0] + inputValues[1];
    }

    // Calculate total output value
    totalOutputValue <== outputValues[0] + outputValues[1];

    // Constraint: input value = output value + withdrawn amount
    totalInputValue === totalOutputValue + amountOut;

}

```

---

## 5. Appendix: Alternative Designs Considered

### 5.1. Dummy Note Approach

An alternative design was considered where a single, universal `Transact` circuit would handle all transactions. This circuit would have a fixed structure of 2 inputs and 2 outputs. To process a transaction with only one real input note, the prover would be required to provide a second "dummy" input note with a value of zero.

This approach relied on an internal `isDummy` signal for each input, which acted as a selector to enable conditional logic. The core mechanics were as follows:

1. **Dummy Note Identification**: An `isDummy` signal was computed for each of the two inputs. This signal had to be robustly constrained to be `1` if the note's `value` was `0`, and `0` otherwise. This was enforced with a pair of constraints using a `valueInverse` private witness:
    - `value * isDummy === 0`
    - `value * valueInverse === 1 - isDummy`
2. **Conditional Merkle Proof**: The circuit would still compute the entire Merkle proof for every input, hashing all the way up the path to calculate a root. The "conditional" part only applied to the final constraint: the computed root was only required to match the public `merkleRoot` if the note was **not** a dummy note (`isDummy` was 0). This was achieved with a constraint like:
    - `(calculatedRoot - merkleRoot) * (1 - isDummy) === 0`

**Rationale for Rejection:**

- **Inefficiency:** This approach requires all transactions, including the common 1-input case, to pay the constraint cost of a full 2-input transaction. A significant part of this overhead comes from computing the full Merkle proof for the dummy note, even though the result is ultimately ignored. The circuit cannot avoid the expensive hashing operations along the path.
- **Complexity and Security Risk:** The conditional logic and the robust binding for `isDummy` add considerable complexity to the circuit. This increases the surface area for potential bugs and vulnerabilities, such as a prover finding a way to satisfy the constraints with a non-existent dummy note, which could violate system invariants.

The chosen templated design avoids these issues by creating lean, specialized circuits for each transaction type, resulting in a more efficient, simpler, and more secure system.
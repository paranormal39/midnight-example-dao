# Midnight DAO Security Model

This document describes the security model, threat assumptions, and cryptographic mechanisms used in the DAO voting contract.

---

## Threat Model

### Assumptions

1. **Trusted Setup:** The Compact compiler and proof server are trusted to generate correct circuits and proofs
2. **Cryptographic Hardness:** Hash functions (`persistentCommit`) are collision-resistant and pre-image resistant
3. **Blockchain Integrity:** The Midnight ledger correctly enforces state transitions and proof verification
4. **Client Security:** Voter secret keys are kept secure on the client device

### Threats Addressed

| Threat | Mitigation |
|--------|------------|
| Double voting | Nullifiers derived in-circuit, stored on-chain |
| Vote manipulation | Tallies incremented inside ZK circuit |
| Unauthorized voting | Merkle tree membership proof required |
| Vote buying (during voting) | Votes hidden via commit/reveal scheme |
| Admin abuse | Multi-sig (2-of-3) required for phase transitions |
| Replay attacks | Round counter included in nullifier derivation |
| Cross-proposal attacks | Proposal ID included in all derivations |

### Out of Scope

- Coercion resistance (voter can prove their vote to a coercer after reveal)
- Sybil resistance (depends on voter registration process)
- Front-running (depends on network-level protections)

---

## Nullifier Domains

Nullifiers prevent double-use of authorizations. Each nullifier type uses a distinct domain separator.

| Domain | Separator | Purpose | Formula |
|--------|-----------|---------|---------|
| Commit | `dao:cn` | Prevents double-commit per proposal | `persistentCommit({proposalId, round, "dao:cn"}, sk)` |
| Reveal | `dao:rn` | Prevents double-reveal per proposal | `persistentCommit({proposalId, round, "dao:rn"}, sk)` |
| Public Key | `dao:pk` | Derives voter public key from secret | `persistentCommit("dao:pk", sk)` |

### Why Domain Separation Matters

Without domain separators, an attacker could potentially:
- Use a commit nullifier as a reveal nullifier
- Reuse nullifiers across different contract features
- Cause collisions between different hash purposes

---

## Commitment Formulas

### Vote Commitment

Used in the commit phase to hide the vote choice.

```
commitment = persistentCommit({
  ballot: Uint<8>,        // 0=NO, 1=YES, 2=APPEAL
  proposalId: Field,
  round: Uint<64>
}, sk)
```

**Properties:**
- Binding: Cannot change vote after committing
- Hiding: Vote choice not revealed until reveal phase
- Unique: Same voter + same proposal + same round = same commitment

### Voter Public Key

Derived from the voter's secret key for authorization.

```
voterPubKey = persistentCommit("dao:pk", sk)
```

---

## Merkle Root Semantics

### Eligible Voters Tree

**Type:** `HistoricMerkleTree<10, Bytes<32>>`

**Leaf format:** `voterPubKey` (32 bytes)

**Purpose:** Proves a voter is authorized to participate

**Verification:**
```compact
assert(
  path.is_some &&
  eligibleVoters.checkRoot(merkleTreePathRoot(path.value)) &&
  voterPubKey == path.value.leaf
)
```

### Vote Commitments Tree

**Type:** `HistoricMerkleTree<10, Bytes<32>>`

**Leaf format:** `commitment` (32 bytes)

**Purpose:** Proves a commitment was made during the commit phase

**Why Historic:** The tree may be updated between commit and reveal phases. Historic trees maintain previous roots so reveal-phase proofs remain valid.

---

## Admin Authorization Model

### Multi-Sig Structure

- **3 admin public keys** stored at initialization
- **2-of-3 signatures** required for privileged operations
- Admin secrets never stored on-chain (only derived public keys)

### Admin-Only Operations

| Operation | Auth Required |
|-----------|---------------|
| `add_eligible_voter` | 1 admin secret |
| `update_block_height` | 1 admin secret |
| `advance_proposal_multisig` | 2 different admin secrets |

### Verification Pattern

```compact
const callerPubKey = derive_voter_pubkey(adminSecret);
assert(
  callerPubKey == admin0 ||
  callerPubKey == admin1 ||
  callerPubKey == admin2,
  "Caller is not an admin"
);
```

---

## Privacy Guarantees

### What is Private

| Data | Privacy Level | Notes |
|------|---------------|-------|
| Voter secret key | **Fully private** | Never leaves client |
| Vote choice (during commit) | **Fully private** | Hidden in commitment |
| Voter identity | **Unlinkable** | Cannot link votes to voters |

### What is Public

| Data | Visibility | Notes |
|------|------------|-------|
| Proposal metadata hash | Public | Proves metadata integrity |
| Vote commitments | Public | Cryptographic hash, doesn't reveal vote |
| Nullifiers | Public | Prevents double-voting |
| Final tallies | Public | After reveal phase |

### Privacy Limitations

1. **Timing analysis:** An observer can see when commitments are submitted
2. **Participation:** The number of voters is visible (commitment count)
3. **Post-reveal:** After revealing, the vote is linked to the commitment (but not to identity)

---

## Circuit Security Invariants

### `vote_commit`

1. Voter must be in `eligibleVoters` Merkle tree
2. Commit nullifier must not already exist
3. Commitment is derived in-circuit from (ballot, proposalId, round, sk)
4. Proposal must be in COMMIT phase
5. Block height must be before commit deadline

### `vote_reveal`

1. Reveal nullifier must not already exist
2. Recomputed commitment must match a leaf in `voteCommitments` tree
3. Tally is incremented inside the circuit (not caller-supplied)
4. Proposal must be in REVEAL phase
5. Block height must be before reveal deadline

### `advance_proposal_multisig`

1. Two different admin secrets required
2. Both must derive to stored admin public keys
3. Admin nonce incremented (replay protection)

---

## Replay Protection

### Round Counter

A global `round` counter is incremented when proposals finalize. This prevents:
- Reusing nullifiers from previous voting rounds
- Replaying old commitments in new proposals

### Admin Nonce

A separate `adminNonce` counter prevents replaying admin actions.

### Proposal Scoping

All nullifiers and commitments include `proposalId`, preventing cross-proposal attacks.

---

## Security Checklist

Before deploying or updating the contract:

- [ ] All nullifiers derived in-circuit using `persistentCommit`
- [ ] All domain separators are unique per operation type
- [ ] Merkle membership verified against on-chain roots
- [ ] Tallies incremented inside circuits, not passed as parameters
- [ ] Admin operations require proof of secret key knowledge
- [ ] Phase transitions check block height deadlines
- [ ] Round counter included in nullifier derivation
- [ ] Historic Merkle trees used where reveal depends on prior state

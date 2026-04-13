# Midnight DAO Development Guide

This guide is a working reference for building and updating Compact smart contracts and related CLI apps, using `midnight-example-dao` as the baseline.

---

## 1) Current Baseline Versions

Before starting any new contract or CLI integration, check the **Midnight Compatibility Matrix**:

**Reference:** [Midnight Documentation → Release Notes → Compatibility Matrix](https://docs.midnight.network/)

| Component | Version |
|-----------|---------|
| Compact devtools | 0.5.1 |
| Compact toolchain / compiler | 0.30.0 |
| Compact runtime | 0.15.0 |
| Compact JS | 2.5.0 |
| Platform JS | 2.2.4 |
| On-chain runtime | 3.0.0 |
| Ledger | 8.0.3 |
| Midnight.js | 4.0.4 |
| testkit-js | 4.0.4 |
| DApp Connector API | 4.0.1 |
| Midnight Indexer | 4.0.1 |
| Proof server | 8.0.3 |

### Rule

Do **not** mix prover, ledger, runtime, and SDK versions casually. Treat these as a compatibility group.

If one of these moves, verify the matching versions in the support matrix before changing anything else.

---

## 2) Version-Check Workflow

Use this checklist whenever you start or update a project.

### Step 1 — Check the Support Matrix First

Before touching dependencies:

1. Open the Midnight compatibility matrix
2. Record the current recommended versions for:
   - proof server
   - ledger
   - compact runtime
   - compact compiler / toolchain
   - midnight-js
   - testkit-js
   - connector/indexer if the app uses them
3. Write those into a project note or `.md` file before coding

### Step 2 — Lock the Stack as a Set

Update:

- `package.json`
- lockfile
- docker compose / yaml files
- CLI runtime config
- README / setup docs

### Step 3 — Run Compatibility Smoke Tests

After any version change, run:

1. Fresh install
2. Compile
3. Build
4. Simulator tests
5. CLI deploy to target environment
6. At least one state-changing transaction that requires proof generation

### Step 4 — Record the Working Matrix

Add a section to the project README called **Known Good Stack** with the exact versions used.

---

## 3) Security Features in Compact

Compact gives you tools for privacy-preserving and correctness-enforced contract design, but they have to be wired into the circuit logic itself.

### A. Nullifiers

**What they are:** A unique value derived from a secret that prevents the same authorization from being used twice.

**Use for:**
- One person, one vote
- One-time claims
- One-time coupon redemption

**Correct pattern:**

```compact
nullifier = persistentCommit([domain_separator, secret_key, proposal_id], sk)
```

**Best practices:**
- Derive nullifiers in-circuit
- Include a domain separator so nullifiers cannot collide across features
- Include proposal ID or action ID when nullifiers are scoped per action
- Store a nullifier-spent flag in contract state
- Reject if the nullifier already exists

### B. Zero-Knowledge Proofs / Witness-Based Private Inputs

**Good uses in a DAO:**
- Prove voter eligibility without exposing the voter's identity publicly
- Prove membership in an allowlist without revealing the whole list path
- Prove a committed vote matches a later reveal
- Prove an admin knows a secret corresponding to an authorized public key

**Design rule:** The security property must be enforced in the circuit, not merely implied by off-chain code.

### C. Merkle Trees

**What they are:** Merkle trees let you commit to a set of values efficiently.

**Typical uses:**
- Eligible voter sets
- Identity registries
- Allowlists
- Commitment sets

**In DAO design:**
- Proving a voter belongs to the eligible set
- Proving a commitment exists in the commit phase during reveal
- Preserving historical lookup capability when using evolving sets

### D. Historic Merkle Trees

**Why they help:** Historic trees are useful when you need to verify membership against a prior committed state during a later phase.

Good fit for:
- Commit/reveal voting
- Phased workflows
- Delayed settlement
- Proofs that depend on a prior snapshot

### E. Commit / Reveal

This is the core privacy pattern for private voting.

**Commit phase:**
```
commitment = hash([proposal_id, vote_choice, voter_secret, salt])
```
Store the commitment in a Merkle tree or set.

**Reveal phase:**
User reveals vote choice, salt, and proof inputs. The circuit verifies:
- The commitment recomputes correctly
- The commitment existed in the committed set
- The nullifier has not been used already
- The voter is eligible

**Close phase:**
Tallies should be derived from valid reveals or a verifiable accumulation process. They should **not** be trusted as arbitrary public parameters.

---

## 4) Patterns to Avoid

### Do Not Do This

- Accept a nullifier as a public parameter without deriving/verifying it in-circuit
- Read a private witness but never bind it to the state transition
- Pass final tallies into `close_proposal` as trusted arguments
- Use bare hashes without domain separation
- Mix environment versions because "it compiles locally"
- Rely on off-chain code for a property the circuit should guarantee

### Instead

- Derive privacy-critical values inside the circuit
- Verify membership against committed roots
- Scope hashes and nullifiers to their action
- Prove correctness, do not assume it

---

## 5) Standard Architecture for Midnight Contracts

### Layer 1 — Contract State

Publicly committed state only:
- Config / admin pubkeys
- Proposal metadata
- Merkle roots
- Nullifier-spent set
- Counters or finalized totals
- Phase windows / block heights

### Layer 2 — Circuit Transitions

Each transition should answer:
- Who is authorized?
- What private claim is being proven?
- What state root or commitment is being checked?
- What replay/double-use protection exists?
- What exact state mutation happens if constraints pass?

### Layer 3 — Off-Chain Coordinator / CLI / App

Responsible for:
- Witness generation
- Merkle proof construction
- Timing / UX
- Wallet signing
- Proof-server orchestration

But **not** responsible for enforcing the core security model.

---

## 6) Build Checklist for a New Compact Contract

### Design

- [ ] Define public state
- [ ] Define private witnesses
- [ ] Define what must be proven in-circuit
- [ ] Define nullifier domains
- [ ] Define Merkle leaf schema
- [ ] Define phase model if using commit/reveal

### Implementation

- [ ] Write Compact contract
- [ ] Add runtime/state helpers
- [ ] Add explicit admin gates
- [ ] Add in-circuit derivations for sensitive hashes/nullifiers
- [ ] Add comments explaining each security invariant

### Testing

- [ ] Unit tests for normal behavior
- [ ] Simulator tests for valid/invalid flows
- [ ] Double-use tests for nullifiers
- [ ] Invalid Merkle path tests
- [ ] Unauthorized admin action tests
- [ ] Replay tests
- [ ] Reveal mismatch tests
- [ ] End-to-end CLI proving tests

### Deployment Readiness

- [ ] Verify support matrix versions
- [ ] Verify proof server image tag
- [ ] Verify CLI and contract packages agree
- [ ] Do a fresh clone test
- [ ] Record known-good stack

---

## 7) Template for AI-Assisted Contract Work

When using AI to help scaffold or update a Midnight contract, give it these rules:

1. Check the latest Midnight compatibility matrix before suggesting package or image versions
2. Keep proof server, ledger, runtime, compiler, and SDK versions compatible as a set
3. Do not implement privacy-sensitive logic only in off-chain code
4. Derive nullifiers and commitments inside Compact circuits whenever they enforce uniqueness or privacy
5. Use domain-separated hashes
6. Prefer Merkle roots + proofs for scalable membership and commitment verification
7. Use HistoricMerkleTree where later-phase verification depends on prior snapshots
8. Never trust caller-supplied tallies for a vote outcome
9. Add simulator and end-to-end tests for both valid and adversarial paths
10. Document the security invariants in plain English next to the implementation

---

## 8) One-Sentence Standard

**If a privacy, uniqueness, authorization, or correctness property matters, it must be enforced by the circuit and validated against the current supported Midnight stack.**

# Midnight DAO Voting Contract - Deployment Documentation

## Overview

This DAO contract enables **privacy-preserving voting** using a **commit/reveal scheme** with cryptographically enforced privacy. Nullifiers and vote commitments are derived inside ZK circuits using `persistentCommit`, and tallies are incremented inside the reveal circuit.

## Contract Architecture

### Proposal State Machine

Proposals progress through these phases:

```
COMMIT → REVEAL → FINAL
```

| Phase | Description |
|-------|-------------|
| **COMMIT** | Voters submit hidden vote commitments |
| **REVEAL** | Voters reveal their votes, tallies are incremented |
| **FINAL** | Voting complete, results are final |

### Ledger State (On-Chain Storage)

| Ledger | Type | Description |
|--------|------|-------------|
| `round` | `Counter` | Current voting round (increments when proposal finalizes) |
| `proposalCount` | `Counter` | Total number of proposals created |
| `proposalMeta` | `Map<Field, Bytes<32>>` | Maps proposalId → SHA-256 hash of metadata JSON |
| `proposalState` | `Map<Field, ProposalState>` | Maps proposalId → current phase (0-3) |
| `voteCommitments` | `MerkleTree<Bytes<32>>` | MerkleTree of vote commitments (hides vote choices) |
| `commitNullifiers` | `Set<Bytes<32>>` | Nullifiers for commit phase (prevents double-commit) |
| `revealNullifiers` | `Set<Bytes<32>>` | Nullifiers for reveal phase (prevents double-reveal) |
| `votesYes` | `Counter` | Global YES vote tally |
| `votesNo` | `Counter` | Global NO vote tally |
| `votesAppeal` | `Counter` | Global APPEAL vote tally |

### Circuits (Smart Contract Functions)

#### `create_proposal(proposalId: Field, metaHash: Bytes<32>)`
Creates a new proposal on-chain (starts in COMMIT phase).

**Parameters:**
- `proposalId` - The proposal ID (should match current `proposalCount`)
- `metaHash` - SHA-256 hash of the proposal metadata JSON

**Actions:**
- Increments `proposalCount`
- Stores `metaHash` in `proposalMeta[proposalId]`
- Sets `proposalState[proposalId]` to COMMIT

#### `vote_commit(proposalId: Field)`
Commits a vote during the COMMIT phase. Vote choice stays hidden.

**Privacy Features:**
- Nullifier derived inside circuit using `persistentCommit(sk, "commit", round, proposalId)`
- Vote commitment derived inside circuit using `persistentCommit(sk, ballot, proposalId)`
- Both are cryptographically enforced by the ZK proof

**Actions:**
- Verifies proposal is in COMMIT phase
- Derives commit nullifier (prevents double-commit)
- Derives vote commitment (hides vote choice)
- Inserts commitment into MerkleTree
- Inserts nullifier into commitNullifiers set

#### `vote_reveal(proposalId: Field)`
Reveals a vote during the REVEAL phase. Tally is incremented inside the circuit.

**Privacy Features:**
- Reveal nullifier derived inside circuit using `persistentCommit(sk, "reveal", round, proposalId)`
- Vote commitment re-derived and verified against MerkleTree
- Tally incremented inside circuit (cryptographically enforced)

**Actions:**
- Verifies proposal is in REVEAL phase
- Derives reveal nullifier (prevents double-reveal)
- Verifies commitment exists in MerkleTree
- Increments appropriate tally counter (YES/NO/APPEAL)

#### `advance_proposal(proposalId: Field)`
Advances proposal to the next phase.

**Actions:**
- COMMIT → REVEAL
- REVEAL → FINAL (also increments round counter)

## TypeScript API

### Key Functions

```typescript
import * as daoApi from './dao-api';

// Deploy a new DAO contract
const contract = await daoApi.deployDaoContract(providers, voterSecret);

// Join an existing contract
const contract = await daoApi.joinDaoContract(providers, contractAddress, voterSecret);

// Create a proposal (starts in COMMIT phase)
await daoApi.createProposal(contract, proposalId, metaHash);

// COMMIT PHASE: Submit hidden vote commitment
await daoApi.voteCommit(contract, proposalId);
// Or use convenience functions (vote choice set in private state):
await daoApi.voteYes(contract, proposalId);
await daoApi.voteNo(contract, proposalId);
await daoApi.voteAppeal(contract, proposalId);

// Advance proposal to next phase
await daoApi.advanceProposal(contract, proposalId);

// REVEAL PHASE: Reveal vote and increment tally
await daoApi.voteReveal(contract, proposalId);

// Get ledger state
const state = await daoApi.getDaoLedgerState(providers, contractAddress);
// state.round - bigint
// state.proposalCount - bigint
// state.proposalMeta - Map<bigint, Uint8Array>
// state.proposalState - Map<bigint, ProposalState>
// state.votesYes - bigint (global tally)
// state.votesNo - bigint (global tally)
// state.votesAppeal - bigint (global tally)

// Get proposal state
const proposalState = await daoApi.getProposalState(providers, contractAddress, proposalId);
// ProposalState.SETUP | COMMIT | REVEAL | FINAL

// Get vote tallies
const votes = await daoApi.getProposalVotes(providers, contractAddress);
// votes.yes, votes.no, votes.appeal - bigint
```

### Data Types

```typescript
enum ProposalState {
  SETUP = 0,
  COMMIT = 1,
  REVEAL = 2,
  FINAL = 3,
}

interface DaoLedgerState {
  round: bigint;
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  proposalState: Map<bigint, ProposalState>;
  votesYes: bigint;
  votesNo: bigint;
  votesAppeal: bigint;
}

interface ProposalVotes {
  yes: bigint;
  no: bigint;
  appeal: bigint;
}

interface ProposalMetadata {
  policyType: string;
  policyTitle: string;
  policyDescription: string;
  contractAddress: string;
  proposalId?: bigint;
}
```

## Building a DApp

### 1. Setup Providers

```typescript
import { configureDaoProviders, generateVoterSecret } from './dao-api';

const voterSecret = generateVoterSecret(); // 32 random bytes
const providers = await configureDaoProviders(walletContext, config);
```

### 2. Deploy or Join Contract

```typescript
// Deploy new
const contract = await deployDaoContract(providers, voterSecret);
const contractAddress = contract.deployTxData.public.contractAddress;

// Or join existing
const contract = await joinDaoContract(providers, '0x...', voterSecret);
```

### 3. Create Proposals

```typescript
import { createHash } from 'crypto';

const metadata = {
  policyType: 'Treasury',
  policyTitle: 'Fund Development',
  policyDescription: 'Allocate 10% of treasury to development'
};

// Compute hash for on-chain storage
const metaHash = createHash('sha256')
  .update(JSON.stringify(metadata))
  .digest();

// Get next proposal ID
const state = await getDaoLedgerState(providers, contractAddress);
const proposalId = state.proposalCount;

// Create on-chain (starts in COMMIT phase)
await createProposal(contract, proposalId, new Uint8Array(metaHash));
```

### 4. Commit Phase - Submit Hidden Vote

```typescript
// During COMMIT phase, submit your vote commitment
// Vote choice is set in private state, commitment derived in circuit
await voteCommit(contract, proposalId);
// Or use convenience functions:
await voteYes(contract, proposalId);
```

### 5. Advance to Reveal Phase

```typescript
// Admin advances proposal to REVEAL phase
await advanceProposal(contract, proposalId);
```

### 6. Reveal Phase - Reveal Vote

```typescript
// During REVEAL phase, reveal your vote
// Tally is incremented inside the ZK circuit
await voteReveal(contract, proposalId);
```

### 7. Finalize and Display Results

```typescript
// Advance to FINAL phase
await advanceProposal(contract, proposalId);

// Display results
const votes = await getProposalVotes(providers, contractAddress);
console.log(`YES: ${votes.yes}, NO: ${votes.no}, APPEAL: ${votes.appeal}`);
```

## Privacy Model

| Data | Privacy |
|------|---------|
| Proposal metadata hash | **Public** (on-chain) |
| Proposal metadata content | **Off-chain** (stored locally) |
| Vote commitments | **Public** (hashed, doesn't reveal vote) |
| Commit nullifiers | **Public** (prevents double-commit) |
| Reveal nullifiers | **Public** (prevents double-reveal) |
| Vote tallies (during commit) | **Hidden** (zero until reveals) |
| Vote tallies (after reveals) | **Public** (incremented in circuit) |
| Individual votes | **Private** (hidden in commitment) |
| Voter identity | **Private** (cannot link to votes) |
| Voter secret key | **Private** (never leaves client) |

### Cryptographic Enforcement

Unlike simple nullifier schemes, this contract **cryptographically enforces** privacy:

1. **Nullifiers derived in circuit** - Using `persistentCommit(sk, ...)`, nullifiers cannot be forged
2. **Commitments in MerkleTree** - Vote choices hidden until reveal phase
3. **Tallies incremented in circuit** - Cannot manipulate vote counts outside ZK proof
4. **Round counter** - Prevents replay attacks across voting rounds

## File Structure

```
contract/
├── src/
│   ├── dao.compact          # Smart contract source
│   └── managed/dao/         # Compiled contract artifacts
│       ├── contract/        # TypeScript bindings
│       ├── keys/            # Prover/verifier keys
│       └── zkir/            # ZK circuit IR

counter-cli/
├── src/
│   ├── dao-api.ts           # Contract API functions
│   ├── dao-cli.ts           # CLI interface
│   ├── dao-types.ts         # TypeScript types
│   ├── dao-storage.ts       # Local proposal storage
│   └── dao-preprod.ts       # Entry point
```

## Running the CLI

```bash
# Start proof server (if not running)
cd counter-cli && docker compose -f proof-server.yml up -d

# Run DAO CLI
npm run dao
```

## Implemented Privacy Features

✅ **Double-voting prevention** - Nullifier sets for commit and reveal phases
✅ **Circuit-derived nullifiers** - Using `persistentCommit` for cryptographic enforcement
✅ **MerkleTree commitments** - Vote choices hidden in MerkleTree
✅ **Tally enforcement** - Incremented inside ZK circuit
✅ **Replay protection** - Round counter prevents cross-round attacks

## Potential Future Improvements

1. **Voter authorization** - Add Merkle tree of authorized voters
2. **Proposal expiry** - Add block height deadlines
3. **Quorum requirements** - Minimum votes to pass
4. **Weighted voting** - Token-based vote weight
5. **On-chain metadata** - Store more proposal data on-chain
6. **Vote delegation** - Allow delegating votes to others
7. **Per-proposal tallies** - Separate tallies for each proposal

## Network Configuration

The contract is configured for **preprod** testnet. See `config.ts` for network settings.

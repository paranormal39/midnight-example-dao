# Midnight DAO Voting Contract - Deployment Documentation

## Overview

This DAO contract enables **privacy-preserving voting** using a **commit/reveal scheme** with comprehensive security features:

1. **Commit/Reveal Voting** - Nullifiers and vote commitments derived inside ZK circuits
2. **Voter Authorization** - MerkleTree-based eligibility verification
3. **Time-Locked Phases** - Block height deadlines for commit and reveal phases
4. **Multi-Sig Administration** - 2-of-3 signature requirement for early phase transitions
5. **Per-Proposal Tallies** - Isolated vote counts with quorum requirements
6. **Replay Protection** - Round counter prevents cross-proposal vote reuse

## Contract Architecture

### Proposal State Machine

Proposals progress through time-locked phases:

```
COMMIT (deadline) → REVEAL (deadline) → FINAL
```

| Phase | Description |
|-------|-------------|
| **COMMIT** | Authorized voters submit hidden vote commitments (until commitDeadline) |
| **REVEAL** | Voters reveal their votes, per-proposal tallies incremented (until revealDeadline) |
| **FINAL** | Voting complete, quorum checked, results are final |

### Ledger State (On-Chain Storage)

#### Core State
| Ledger | Type | Description |
|--------|------|-------------|
| `round` | `Counter` | Current voting round (increments when proposal finalizes) |
| `proposalCount` | `Counter` | Total number of proposals created |
| `proposalMeta` | `Map<Field, Bytes<32>>` | Maps proposalId → SHA-256 hash of metadata JSON |
| `proposalState` | `Map<Field, ProposalState>` | Maps proposalId → current phase (0-3) |

#### Voter Authorization
| Ledger | Type | Description |
|--------|------|-------------|
| `eligibleVoters` | `MerkleTree<Bytes<32>>` | MerkleTree of eligible voter public keys |

#### Time-Locked Phases
| Ledger | Type | Description |
|--------|------|-------------|
| `commitDeadline` | `Map<Field, Uint<64>>` | Block height when commit phase ends per proposal |
| `revealDeadline` | `Map<Field, Uint<64>>` | Block height when reveal phase ends per proposal |
| `currentBlockHeight` | `Map<Field, Uint<64>>` | Current block height (key 0) |

#### Multi-Sig Administration
| Ledger | Type | Description |
|--------|------|-------------|
| `adminPubKeys` | `Map<Field, Bytes<32>>` | Admin public keys (keys 0, 1, 2) |
| `adminNonce` | `Counter` | Nonce for replay protection on admin actions |

#### Per-Proposal Tallies & Quorum
| Ledger | Type | Description |
|--------|------|-------------|
| `voteCommitments` | `MerkleTree<Bytes<32>>` | MerkleTree of vote commitments |
| `commitNullifiers` | `Set<Bytes<32>>` | Nullifiers for commit phase (prevents double-commit) |
| `revealNullifiers` | `Set<Bytes<32>>` | Nullifiers for reveal phase (prevents double-reveal) |
| `proposalVotesYes` | `Map<Field, Uint<32>>` | Per-proposal YES vote tally |
| `proposalVotesNo` | `Map<Field, Uint<32>>` | Per-proposal NO vote tally |
| `proposalVotesAppeal` | `Map<Field, Uint<32>>` | Per-proposal APPEAL vote tally |
| `proposalTotalVotes` | `Map<Field, Uint<32>>` | Per-proposal total vote count |
| `proposalQuorumReached` | `Map<Field, Boolean>` | Whether quorum (3 votes) was reached |

### Circuits (Smart Contract Functions)

#### Initialization

##### `initialize_dao(admin0, admin1, admin2: Bytes<32>)`
Initializes the DAO with 3 admin public keys for multi-sig operations.

##### `add_eligible_voter(voterPubKey: Bytes<32>)`
Adds a voter's public key to the eligible voters MerkleTree.

##### `update_block_height(newHeight: Uint<64>)`
Updates the current block height (called by oracle or trusted source).

#### Proposal Management

##### `create_proposal(proposalId: Field, metaHash: Bytes<32>, commitDuration: Uint<64>, revealDuration: Uint<64>)`
Creates a new proposal with time-locked phases.

**Parameters:**
- `proposalId` - The proposal ID
- `metaHash` - SHA-256 hash of the proposal metadata JSON
- `commitDuration` - Number of blocks for commit phase
- `revealDuration` - Number of blocks for reveal phase

**Actions:**
- Sets deadlines: `commitDeadline = currentBlockHeight + commitDuration`
- Sets deadlines: `revealDeadline = commitDeadline + revealDuration`
- Initializes per-proposal tallies to zero

#### Voting

##### `vote_commit(proposalId: Field)`
Commits a vote during the COMMIT phase. **Requires voter authorization.**

**Security Features:**
- Verifies voter is in `eligibleVoters` MerkleTree
- Verifies `currentBlockHeight <= commitDeadline`
- Nullifier derived inside circuit using `persistentCommit`
- Vote commitment derived inside circuit

##### `vote_reveal(proposalId: Field)`
Reveals a vote during the REVEAL phase. Per-proposal tally incremented inside circuit.

**Security Features:**
- Verifies `currentBlockHeight <= revealDeadline`
- Verifies commitment exists in MerkleTree
- Increments per-proposal tally (YES/NO/APPEAL)
- Updates `proposalTotalVotes` and checks quorum (≥3 votes)

#### Phase Transitions

##### `advance_proposal_by_time(proposalId: Field)`
Advances proposal after deadline passes. **Anyone can call.**

**Actions:**
- COMMIT → REVEAL (requires `currentBlockHeight > commitDeadline`)
- REVEAL → FINAL (requires `currentBlockHeight > revealDeadline`)

##### `advance_proposal_multisig(proposalId: Field, sig0: Bytes<64>, sig1: Bytes<64>)`
Advances proposal early with 2-of-3 admin signatures.

**Actions:**
- Verifies 2 valid admin signatures
- Increments `adminNonce` for replay protection
- Advances to next phase

##### `check_proposal_result(proposalId: Field)`
Verifies proposal is finalized and quorum was reached.

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

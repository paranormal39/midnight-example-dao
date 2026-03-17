# Midnight DAO Voting Contract - Deployment Documentation

## Overview

This DAO contract enables **privacy-preserving voting** on proposals. Individual votes remain private while vote totals are publicly visible on-chain.

## Contract Address

**Deployed Contract:** `3f3cbd3608f14a44faa19ea4d4...` (from your deployment)

## Contract Architecture

### Ledger State (On-Chain Storage)

| Ledger | Type | Description |
|--------|------|-------------|
| `proposalCount` | `Counter` | Total number of proposals created |
| `proposalMeta` | `Map<Field, Bytes<32>>` | Maps proposalId → SHA-256 hash of metadata JSON |
| `votesYes` | `Map<Field, Field>` | Maps proposalId → YES vote count |
| `votesNo` | `Map<Field, Field>` | Maps proposalId → NO vote count |
| `votesAppeal` | `Map<Field, Field>` | Maps proposalId → APPEAL vote count |

### Circuits (Smart Contract Functions)

#### `create_proposal(proposalId: Field, metaHash: Bytes<32>)`
Creates a new proposal on-chain.

**Parameters:**
- `proposalId` - The proposal ID (should match current `proposalCount`)
- `metaHash` - SHA-256 hash of the proposal metadata JSON

**Actions:**
- Increments `proposalCount`
- Stores `metaHash` in `proposalMeta[proposalId]`
- Initializes vote counters to 0

#### `vote_yes(proposalId: Field, currentVotes: Field)`
Casts a YES vote on a proposal.

**Parameters:**
- `proposalId` - The proposal to vote on
- `currentVotes` - Current YES vote count (read from ledger off-chain)

#### `vote_no(proposalId: Field, currentVotes: Field)`
Casts a NO vote on a proposal.

#### `vote_appeal(proposalId: Field, currentVotes: Field)`
Casts an APPEAL vote on a proposal.

## TypeScript API

### Key Functions

```typescript
import * as daoApi from './dao-api';

// Deploy a new DAO contract
const contract = await daoApi.deployDaoContract(providers);

// Join an existing contract
const contract = await daoApi.joinDaoContract(providers, contractAddress);

// Create a proposal
await daoApi.createProposal(contract, proposalId, metaHash);

// Vote on a proposal
await daoApi.voteYes(contract, proposalId, currentVotes);
await daoApi.voteNo(contract, proposalId, currentVotes);
await daoApi.voteAppeal(contract, proposalId, currentVotes);

// Get ledger state
const state = await daoApi.getDaoLedgerState(providers, contractAddress);
// state.proposalCount - bigint
// state.proposalMeta - Map<bigint, Uint8Array>
// state.votesYes - Map<bigint, bigint>
// state.votesNo - Map<bigint, bigint>
// state.votesAppeal - Map<bigint, bigint>

// Get votes for a specific proposal
const votes = await daoApi.getProposalVotes(providers, contractAddress, proposalId);
// votes.yes, votes.no, votes.appeal - bigint
```

### Data Types

```typescript
interface DaoLedgerState {
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  votesYes: Map<bigint, bigint>;
  votesNo: Map<bigint, bigint>;
  votesAppeal: Map<bigint, bigint>;
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
import { configureDaoProviders } from './dao-api';

const providers = await configureDaoProviders(walletContext, config);
```

### 2. Deploy or Join Contract

```typescript
// Deploy new
const contract = await deployDaoContract(providers);
const contractAddress = contract.deployTxData.public.contractAddress;

// Or join existing
const contract = await joinDaoContract(providers, '0x...');
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

// Create on-chain
await createProposal(contract, proposalId, new Uint8Array(metaHash));
```

### 4. Vote on Proposals

```typescript
// Get current vote count first
const votes = await getProposalVotes(providers, contractAddress, proposalId);

// Cast vote (pass current count to increment)
await voteYes(contract, proposalId, votes.yes);
// or
await voteNo(contract, proposalId, votes.no);
// or
await voteAppeal(contract, proposalId, votes.appeal);
```

### 5. Display Results

```typescript
const votes = await getProposalVotes(providers, contractAddress, proposalId);
console.log(`YES: ${votes.yes}, NO: ${votes.no}, APPEAL: ${votes.appeal}`);
```

## Privacy Model

| Data | Privacy |
|------|---------|
| Proposal metadata hash | **Public** (on-chain) |
| Proposal metadata content | **Off-chain** (stored locally) |
| Individual votes | **Private** (ZK proof) |
| Vote totals | **Public** (on-chain) |
| Voter identity | **Private** (not linked to votes) |

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

## Potential Improvements

1. **Double-voting prevention** - Add nullifier sets per proposal
2. **Voter authorization** - Add Merkle tree of authorized voters
3. **Proposal expiry** - Add block height deadlines
4. **Quorum requirements** - Minimum votes to pass
5. **Weighted voting** - Token-based vote weight
6. **On-chain metadata** - Store more proposal data on-chain
7. **Vote delegation** - Allow delegating votes to others

## Network Configuration

The contract is configured for **preprod** testnet. See `config.ts` for network settings.

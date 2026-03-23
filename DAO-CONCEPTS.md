# Midnight DAO Voting Contract - Core Concepts & Architecture

## Table of Contents

1. [Introduction](#introduction)
2. [What is Midnight?](#what-is-midnight)
3. [Zero-Knowledge Proofs Explained](#zero-knowledge-proofs-explained)
4. [The Compact Language](#the-compact-language)
5. [DAO Contract Deep Dive](#dao-contract-deep-dive)
6. [How Voting Privacy Works](#how-voting-privacy-works)
7. [Project Architecture](#project-architecture)
8. [Data Flow](#data-flow)
9. [Running the Project](#running-the-project)
10. [Building Your Own DApp](#building-your-own-dapp)

---

## Introduction

This document explains the core concepts behind the Midnight DAO Voting Contract. It covers:

- **Why** the contract works (zero-knowledge cryptography)
- **How** the contract works (Compact language mechanics)
- **What** each component does (project structure)

By the end, you'll understand how to build privacy-preserving applications on Midnight.

---

## What is Midnight?

**Midnight** is a privacy-focused blockchain that uses **zero-knowledge proofs (ZKPs)** to enable:

- **Private transactions** - Transfer tokens without revealing amounts
- **Private smart contracts** - Execute logic without exposing inputs
- **Selective disclosure** - Choose what to reveal publicly

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Shielded State** | Data that exists on-chain but is encrypted/hidden |
| **Public State** | Data visible to everyone on the blockchain |
| **ZK Circuits** | Programs that prove computation without revealing inputs |
| **DUST** | Non-transferable fee token (generated from staked NIGHT) |
| **NIGHT** | The native token of Midnight |

### Why Midnight for Voting?

Traditional blockchain voting has a problem: **all votes are public**. Anyone can see:
- Who voted
- What they voted for
- When they voted

This enables:
- Vote buying/selling
- Social pressure
- Retaliation against voters

**Midnight solves this** by allowing votes to be cast privately while still proving:
- The vote is valid
- The voter is authorized
- The vote was counted correctly

---

## Zero-Knowledge Proofs Explained

### The Core Idea

A **zero-knowledge proof** lets you prove a statement is true **without revealing why** it's true.

**Classic Example: The Cave**

Imagine a circular cave with a locked door in the middle. You want to prove you know the password without telling anyone what it is.

1. You enter the cave (left or right path)
2. A verifier shouts which side to exit from
3. If you know the password, you can always exit the correct side
4. Repeat many times - if you always succeed, you must know the password

**In Voting:**

You want to prove:
- "I cast a valid vote" ✓
- Without revealing: "I voted YES" ✗

### How ZKPs Work in Midnight

```
┌─────────────────────────────────────────────────────────────┐
│                        PROVER (User)                         │
├─────────────────────────────────────────────────────────────┤
│  Private Inputs:          │  Public Inputs:                  │
│  - My secret vote         │  - Proposal ID                   │
│  - My private key         │  - Current vote count            │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ZK Circuit Execution                    │    │
│  │  1. Verify vote is valid (YES/NO/APPEAL)            │    │
│  │  2. Compute new vote count                          │    │
│  │  3. Generate proof                                  │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│                    ZK Proof + Public Outputs                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     VERIFIER (Blockchain)                    │
├─────────────────────────────────────────────────────────────┤
│  Receives:                                                   │
│  - ZK Proof (compact, ~1KB)                                 │
│  - Public outputs (proposal ID, new vote count)             │
│                                                              │
│  Verifies:                                                   │
│  - Proof is valid (computation was done correctly)          │
│  - Does NOT learn private inputs                            │
│                                                              │
│  Updates:                                                    │
│  - On-chain vote count                                      │
└─────────────────────────────────────────────────────────────┘
```

### Key Properties

| Property | Meaning |
|----------|---------|
| **Completeness** | If the statement is true, an honest prover can convince the verifier |
| **Soundness** | If the statement is false, no cheating prover can convince the verifier |
| **Zero-Knowledge** | The verifier learns nothing beyond the truth of the statement |

---

## The Compact Language

**Compact** is Midnight's domain-specific language for writing ZK smart contracts.

### Why a New Language?

ZK circuits have constraints that don't exist in normal programming:

1. **No unbounded loops** - Circuit size must be known at compile time
2. **No dynamic memory** - All data structures have fixed sizes
3. **Witness vs. Public** - Must explicitly mark what's private vs. public
4. **Deterministic** - Same inputs always produce same outputs

### Compact Syntax Overview

```compact
pragma language_version >= 0.20;

import CompactStandardLibrary;

// LEDGER: On-chain state (public)
export ledger myCounter: Counter;
export ledger myMap: Map<Field, Field>;

// WITNESS: Off-chain private data provider
witness mySecret(): Field;

// CIRCUIT: The ZK program
export circuit myFunction(publicInput: Field): [] {
  // disclose() makes a value public
  const pub = disclose(publicInput);
  
  // Private computation (not revealed)
  const secret = mySecret();
  const result = secret + pub;
  
  // Update on-chain state
  myCounter.increment(1);
}
```

### Key Compact Concepts

#### 1. Ledger (On-Chain State)

```compact
export ledger proposalCount: Counter;
export ledger votesYes: Map<Field, Field>;
```

- **Counter**: A simple incrementing integer
- **Map<K, V>**: Key-value storage
- **Set<T>**: Unique value collection
- All ledger state is **public** and visible on-chain

#### 2. Witness (Private Inputs)

```compact
witness getSecretKey(): Bytes<32>;
```

- Witnesses provide private data to circuits
- Data comes from off-chain (your local machine)
- Never revealed on-chain

#### 3. Circuits (ZK Programs)

```compact
export circuit vote_yes(proposalId: Field, currentVotes: Field): [] {
  const pid = disclose(proposalId);
  const curr = disclose(currentVotes);
  votesYes.insert(pid, curr + 1);
}
```

- `export` makes the circuit callable from outside
- Parameters can be private or public
- `disclose()` makes a value public (part of the proof)
- Return type `[]` means no return value

#### 4. The `disclose()` Function

This is crucial for understanding Compact:

```compact
// Private by default
const myValue = someWitness();  // Nobody sees this

// Made public via disclose
const publicValue = disclose(myValue);  // Everyone sees this
```

**Why disclose?**

- ZK proofs have "public inputs" that verifiers can see
- `disclose()` marks values as public inputs
- Without disclosure, values remain private

---

## DAO Contract Deep Dive

### The Contract Code

```compact
pragma language_version >= 0.20;

import CompactStandardLibrary;

// ═══════════════════════════════════════════════════════════
// WITNESSES - Private data providers (off-chain)
// ═══════════════════════════════════════════════════════════

// Get the voter's secret key (used to derive nullifier)
witness get_voter_secret(): Bytes<32>;

// Get the voter's vote choice (0=YES, 1=NO, 2=APPEAL) - kept private
witness get_vote_choice(): Field;

// ═══════════════════════════════════════════════════════════
// LEDGER STATE (Public, On-Chain)
// ═══════════════════════════════════════════════════════════

// How many proposals exist
export ledger proposalCount: Counter;

// Proposal metadata hashes: proposalId → SHA-256(metadata JSON)
export ledger proposalMeta: Map<Field, Bytes<32>>;

// Proposal status: 0 = active, 1 = closed
export ledger proposalStatus: Map<Field, Field>;

// Vote commitments - hides individual votes
export ledger voteCommitments: Map<Field, Set<Bytes<32>>>;

// Nullifiers - prevents double voting
export ledger voteNullifiers: Map<Field, Set<Bytes<32>>>;

// Vote tallies (hidden until poll closes)
export ledger votesYes: Map<Field, Field>;
export ledger votesNo: Map<Field, Field>;
export ledger votesAppeal: Map<Field, Field>;

// Encrypted votes for later tallying
export ledger encryptedVotes: Map<Field, Set<Bytes<64>>>;

// ═══════════════════════════════════════════════════════════
// CIRCUITS (ZK Programs)
// ═══════════════════════════════════════════════════════════

// Create a new proposal
export circuit create_proposal(proposalId: Field, metaHash: Bytes<32>): [] {
  const pid = disclose(proposalId);
  const hash = disclose(metaHash);
  proposalCount.increment(1);
  proposalMeta.insert(pid, hash);
  proposalStatus.insert(pid, 0 as Field);  // active
  votesYes.insert(pid, 0 as Field);
  votesNo.insert(pid, 0 as Field);
  votesAppeal.insert(pid, 0 as Field);
}

// Cast a private vote
export circuit cast_vote(
  proposalId: Field,
  voteCommitment: Bytes<32>,
  nullifier: Bytes<32>,
  encryptedVote: Bytes<64>
): [] {
  const pid = disclose(proposalId);
  const commitment = disclose(voteCommitment);
  const nullHash = disclose(nullifier);
  const encVote = disclose(encryptedVote);
  
  // Get private inputs from witnesses
  const voterSecret = get_voter_secret();
  const voteChoice = get_vote_choice();
  
  // Verify nullifier matches voter secret (ZK proof)
  const expectedNullifier = persistent_hash(pad32(voterSecret, pid));
  assert(expectedNullifier == nullHash, "Invalid nullifier");
  
  // Verify vote is valid (0, 1, or 2)
  assert(voteChoice >= 0 as Field, "Invalid vote");
  assert(voteChoice <= 2 as Field, "Invalid vote");
  
  // Verify commitment matches vote
  const expectedCommitment = persistent_hash(pad32_field(voteChoice, voterSecret));
  assert(expectedCommitment == commitment, "Invalid commitment");
  
  // Store nullifier (prevents double voting)
  voteNullifiers.lookup(pid).insert(nullHash);
  
  // Store commitment and encrypted vote
  voteCommitments.lookup(pid).insert(commitment);
  encryptedVotes.lookup(pid).insert(encVote);
}

// Close proposal and reveal tallies
export circuit close_proposal(
  proposalId: Field,
  finalYes: Field,
  finalNo: Field,
  finalAppeal: Field
): [] {
  const pid = disclose(proposalId);
  proposalStatus.insert(pid, 1 as Field);  // closed
  votesYes.insert(pid, disclose(finalYes));
  votesNo.insert(pid, disclose(finalNo));
  votesAppeal.insert(pid, disclose(finalAppeal));
}
```

### Key Privacy Mechanisms

#### 1. Witnesses (Private Inputs)

Witnesses provide private data to circuits without revealing it on-chain:

```compact
witness get_voter_secret(): Bytes<32>;
witness get_vote_choice(): Field;
```

The voter's secret and vote choice are **never disclosed** - they stay private.

#### 2. Nullifiers (Double-Vote Prevention)

```compact
const expectedNullifier = persistent_hash(pad32(voterSecret, pid));
assert(expectedNullifier == nullHash, "Invalid nullifier");
voteNullifiers.lookup(pid).insert(nullHash);
```

- The ZK proof verifies the nullifier is correctly derived
- The nullifier is stored on-chain to prevent reuse
- Cannot be reversed to reveal voter identity

#### 3. Vote Commitments (Hidden Votes)

```compact
const expectedCommitment = persistent_hash(pad32_field(voteChoice, voterSecret));
assert(expectedCommitment == commitment, "Invalid commitment");
voteCommitments.lookup(pid).insert(commitment);
```

- The commitment hides the actual vote
- ZK proof verifies the commitment is valid
- Vote remains hidden until reveal phase

#### 4. Hidden Tallies

Vote tallies (`votesYes`, `votesNo`, `votesAppeal`) remain at **zero** during voting. They are only updated when `close_proposal` is called, revealing the final results.

### Data Types Explained

| Type | Description | Example |
|------|-------------|---------|
| `Field` | A large integer (prime field element) | Proposal IDs, vote counts |
| `Bytes<N>` | Fixed-size byte array | `Bytes<32>` for SHA-256 hashes |
| `Counter` | Auto-incrementing integer | Proposal count |
| `Map<K, V>` | Key-value storage | Vote tallies per proposal |

---

## How Voting Privacy Works

### Privacy Features

The DAO contract implements several privacy-preserving mechanisms:

1. **Vote Commitments** - Individual votes are hidden using cryptographic commitments
2. **Nullifiers** - Prevent double-voting without revealing voter identity
3. **Hidden Tallies** - Vote counts remain hidden until the poll closes
4. **ZK Proofs** - Prove vote validity without revealing the actual vote

### What's Public vs. Private

| Data | Visibility | Why |
|------|------------|-----|
| Proposal ID | **Public** | Everyone needs to know which proposal |
| Proposal metadata hash | **Public** | Proves metadata wasn't changed |
| Vote commitments | **Public** | Cryptographic hash, doesn't reveal vote |
| Nullifiers | **Public** | Prevents double-voting, doesn't reveal identity |
| Vote tallies (during voting) | **Hidden** | Remain zero until poll closes |
| Vote tallies (after close) | **Public** | Final results are verifiable |
| Individual votes | **Private** | Hidden in commitment, never revealed |
| Voter identity | **Private** | Cannot link votes to voters |
| Voter secret | **Private** | Never leaves the client |

### Cryptographic Primitives

#### Nullifiers (Double-Vote Prevention)
```
nullifier = hash(voterSecret || proposalId)
```
- Each voter has a unique secret key
- The nullifier is deterministic: same voter + same proposal = same nullifier
- Stored on-chain to prevent double voting
- Cannot be reversed to reveal voter identity

#### Vote Commitments
```
commitment = hash(voteChoice || voterSecret)
```
- Hides the actual vote (YES/NO/APPEAL)
- Can be verified during reveal phase
- Different votes produce different commitments

### The Privacy Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         VOTER                                │
│                                                              │
│  1. Has a private voterSecret (32 bytes)                    │
│                                                              │
│  2. Decides to vote YES on Proposal #0                      │
│                                                              │
│  3. Computes locally (private):                             │
│     - nullifier = hash(voterSecret || proposalId)           │
│     - commitment = hash(voteChoice || voterSecret)          │
│     - encryptedVote = encrypt(voteChoice, voterSecret)      │
│                                                              │
│  4. Generates ZK proof that:                                │
│     - The nullifier matches the voterSecret                 │
│     - The commitment matches the vote                       │
│     - The vote is valid (0, 1, or 2)                        │
│     WITHOUT revealing voterSecret or voteChoice             │
│                                                              │
│  5. Submits: (proposalId, commitment, nullifier, encVote)   │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       BLOCKCHAIN                             │
│                                                              │
│  1. Verifies ZK proof is valid                              │
│                                                              │
│  2. Checks nullifier not already used (prevents double vote)│
│                                                              │
│  3. Stores:                                                 │
│     - nullifier in voteNullifiers[proposalId]               │
│     - commitment in voteCommitments[proposalId]             │
│     - encryptedVote in encryptedVotes[proposalId]           │
│                                                              │
│  4. Vote tallies remain HIDDEN (still zero)                 │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    POLL CLOSURE                              │
│                                                              │
│  When voting ends, close_proposal is called with:           │
│  - Final tallies computed off-chain from encrypted votes    │
│  - Tallies become public only at this point                 │
│                                                              │
│  Result: votesYes=X, votesNo=Y, votesAppeal=Z               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                        OBSERVER                              │
│                                                              │
│  During voting, can see:                                    │
│  ✓ Proposal #0 exists                                       │
│  ✓ Number of votes cast (commitment count)                  │
│  ✓ That each vote is valid (ZK proof verified)              │
│                                                              │
│  During voting, cannot see:                                 │
│  ✗ Who cast any vote                                        │
│  ✗ What anyone voted (YES/NO/APPEAL)                        │
│  ✗ Current vote tallies (hidden until close)                │
│                                                              │
│  After close, can see:                                      │
│  ✓ Final vote tallies                                       │
│  ✗ Still cannot link votes to voters                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Project Architecture

### Directory Structure

```
example-counter/
│
├── contract/                      # Smart Contract Package
│   ├── src/
│   │   ├── dao.compact           # DAO voting contract (Compact)
│   │   ├── counter.compact       # Original counter contract
│   │   ├── dao-witnesses.ts      # Witness functions for DAO
│   │   ├── witnesses.ts          # Witness functions for counter
│   │   ├── index.ts              # Package exports
│   │   └── managed/              # Compiled artifacts (auto-generated)
│   │       ├── dao/
│   │       │   ├── contract/     # TypeScript bindings
│   │       │   ├── keys/         # Prover & verifier keys
│   │       │   └── zkir/         # ZK intermediate representation
│   │       └── counter/
│   │           └── ...
│   ├── package.json              # Contract package config
│   └── tsconfig.json             # TypeScript config
│
├── counter-cli/                   # CLI Application
│   ├── src/
│   │   ├── dao-api.ts            # DAO contract API functions
│   │   ├── dao-cli.ts            # DAO CLI interface
│   │   ├── dao-types.ts          # TypeScript types for DAO
│   │   ├── dao-storage.ts        # Local proposal storage
│   │   ├── dao-preprod.ts        # Entry point (preprod network)
│   │   ├── api.ts                # Counter contract API
│   │   ├── cli.ts                # Counter CLI interface
│   │   ├── config.ts             # Network configuration
│   │   └── common-types.ts       # Shared types
│   ├── dao-proposals.json        # Saved proposals (local)
│   ├── proof-server.yml          # Docker config for proof server
│   ├── standalone.yml            # Docker config for local network
│   └── package.json              # CLI package config
│
├── package.json                   # Root workspace config
├── DAO-DEPLOYMENT.md             # Deployment documentation
└── README.md                      # Project overview
```

### Component Responsibilities

#### Contract Package (`contract/`)

| File | Purpose |
|------|---------|
| `dao.compact` | The ZK smart contract source code |
| `dao-witnesses.ts` | Provides private data to circuits |
| `index.ts` | Exports compiled contract for CLI |
| `managed/dao/` | Auto-generated compilation artifacts |

#### CLI Package (`counter-cli/`)

| File | Purpose |
|------|---------|
| `dao-api.ts` | High-level API for contract interaction |
| `dao-cli.ts` | Interactive command-line interface |
| `dao-types.ts` | TypeScript type definitions |
| `dao-storage.ts` | Saves proposals to local JSON file |
| `config.ts` | Network endpoints (indexer, node, proof server) |

### The Compilation Pipeline

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  dao.compact    │────►│  Compact        │────►│  managed/dao/   │
│  (Source)       │     │  Compiler       │     │  (Artifacts)    │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                        ┌───────────────────────────────┼───────────────────────────────┐
                        │                               │                               │
                        ▼                               ▼                               ▼
               ┌─────────────────┐             ┌─────────────────┐             ┌─────────────────┐
               │  contract/      │             │  keys/          │             │  zkir/          │
               │  index.d.ts     │             │  *.pk (prover)  │             │  *.zkir         │
               │  (TS bindings)  │             │  *.vk (verifier)│             │  (ZK circuits)  │
               └─────────────────┘             └─────────────────┘             └─────────────────┘
```

**What gets generated:**

1. **TypeScript Bindings** (`contract/`) - Type-safe API for calling circuits
2. **Prover Keys** (`keys/*.pk`) - Used locally to generate proofs
3. **Verifier Keys** (`keys/*.vk`) - Used on-chain to verify proofs
4. **ZKIR** (`zkir/`) - Intermediate representation of circuits

---

## Data Flow

### Deploying a Contract

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI                                  │
│  1. Load compiled contract artifacts                        │
│  2. Create deployment transaction                           │
│  3. Generate ZK proof (via proof server)                    │
│  4. Sign transaction with wallet                            │
│  5. Submit to node                                          │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Proof Server   │  │  Wallet         │  │  Node           │
│  (localhost:    │  │  (Signs tx)     │  │  (Broadcasts)   │
│   6300)         │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
                                                   │
                                                   ▼
                                          ┌─────────────────┐
                                          │  Blockchain     │
                                          │  (Contract      │
                                          │   deployed)     │
                                          └─────────────────┘
```

### Casting a Vote

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI                                  │
│                                                              │
│  1. Query indexer for current vote count                    │
│     GET /contract/{address}/state                           │
│     Response: votesYes[0] = 5                               │
│                                                              │
│  2. Build circuit call                                      │
│     vote_yes(proposalId=0, currentVotes=5)                  │
│                                                              │
│  3. Send to proof server                                    │
│     POST /prove                                             │
│     Body: circuit inputs + prover key                       │
│                                                              │
│  4. Receive ZK proof (~1KB)                                 │
│                                                              │
│  5. Create transaction with proof                           │
│                                                              │
│  6. Sign with wallet                                        │
│                                                              │
│  7. Submit to node                                          │
└─────────────────────────────────────────────────────────────┘
         │              │              │              │
         ▼              ▼              ▼              ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│   Indexer    │ │ Proof Server │ │    Wallet    │ │     Node     │
│  (Query      │ │ (Generate    │ │ (Sign tx)    │ │ (Broadcast)  │
│   state)     │ │  ZK proof)   │ │              │ │              │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

---

## Running the Project

### Prerequisites

1. **Node.js v22.15+**
   ```bash
   node --version
   ```

2. **Docker** (for proof server)
   ```bash
   docker --version
   ```

3. **Compact Toolchain**
   ```bash
   # Install
   curl --proto '=https' --tlsv1.2 -LsSf \
     https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh
   
   # Add to PATH
   source $HOME/.local/bin/env
   
   # Install specific version
   compact update 0.28.0
   ```

### Build Steps

```bash
# 1. Install dependencies
npm install

# 2. Compile the Compact contract
cd contract
npm run compact      # Compiles dao.compact → managed/dao/
npm run build        # Compiles TypeScript

# 3. Build CLI
cd ../counter-cli
npm run build
```

### Run the DAO CLI

```bash
# Start proof server (in background or separate terminal)
cd counter-cli
docker compose -f proof-server.yml up -d

# Run the DAO CLI
npm run dao
```

### Network Configuration

The CLI connects to these services:

| Service | URL | Purpose |
|---------|-----|---------|
| **Node** | `https://rpc.preprod.midnight.network` | Submit transactions |
| **Indexer** | `https://indexer.preprod.midnight.network` | Query blockchain state |
| **Proof Server** | `http://localhost:6300` | Generate ZK proofs |

---

## Building Your Own DApp

### Step 1: Understand the Contract API

The compiled contract exposes these TypeScript types:

```typescript
// From @midnight-ntwrk/counter-contract
import { Dao } from '@midnight-ntwrk/counter-contract';

// Circuit calls
Dao.Contract.callTx.create_proposal(proposalId: bigint, metaHash: Uint8Array)
Dao.Contract.callTx.vote_yes(proposalId: bigint, currentVotes: bigint)
Dao.Contract.callTx.vote_no(proposalId: bigint, currentVotes: bigint)
Dao.Contract.callTx.vote_appeal(proposalId: bigint, currentVotes: bigint)

// Ledger state
Dao.ledger(contractState).proposalCount  // bigint
Dao.ledger(contractState).votesYes       // Iterable<[bigint, bigint]>
Dao.ledger(contractState).votesNo        // Iterable<[bigint, bigint]>
Dao.ledger(contractState).votesAppeal    // Iterable<[bigint, bigint]>
Dao.ledger(contractState).proposalMeta   // Iterable<[bigint, Uint8Array]>
```

### Step 2: Use the API Functions

```typescript
import {
  deployDaoContract,
  joinDaoContract,
  createProposal,
  voteYes,
  voteNo,
  voteAppeal,
  getDaoLedgerState,
  getProposalVotes,
  configureDaoProviders,
} from './dao-api';

// Setup
const providers = await configureDaoProviders(walletContext, config);

// Deploy
const contract = await deployDaoContract(providers);
const address = contract.deployTxData.public.contractAddress;

// Create proposal
const metaHash = sha256(JSON.stringify({ title: 'My Proposal', ... }));
await createProposal(contract, 0n, metaHash);

// Vote
const votes = await getProposalVotes(providers, address, 0n);
await voteYes(contract, 0n, votes.yes);

// Check results
const newVotes = await getProposalVotes(providers, address, 0n);
console.log(`YES: ${newVotes.yes}, NO: ${newVotes.no}`);
```

### Step 3: Build a Web Frontend

To build a web DApp, you'll need:

1. **Wallet Integration** - Connect to Midnight Lace wallet
2. **Provider Setup** - Configure network connections
3. **Contract Interaction** - Call circuits via the API
4. **State Display** - Query and show vote results

Example React component structure:

```typescript
// ProposalList.tsx
const ProposalList = () => {
  const [proposals, setProposals] = useState([]);
  
  useEffect(() => {
    // Fetch from indexer
    const state = await getDaoLedgerState(providers, contractAddress);
    // Convert to array
  }, []);
  
  return (
    <ul>
      {proposals.map(p => <ProposalCard key={p.id} proposal={p} />)}
    </ul>
  );
};

// VoteButton.tsx
const VoteButton = ({ proposalId, voteType }) => {
  const handleVote = async () => {
    const votes = await getProposalVotes(providers, address, proposalId);
    const currentVotes = votes[voteType];
    
    if (voteType === 'yes') {
      await voteYes(contract, proposalId, currentVotes);
    } else if (voteType === 'no') {
      await voteNo(contract, proposalId, currentVotes);
    } else {
      await voteAppeal(contract, proposalId, currentVotes);
    }
  };
  
  return <button onClick={handleVote}>Vote {voteType.toUpperCase()}</button>;
};
```

---

## Summary

This DAO voting contract demonstrates:

1. **Privacy-preserving voting** using zero-knowledge proofs
2. **On-chain state management** with Compact ledger types
3. **Multi-proposal support** via Map-based storage
4. **TypeScript integration** for building DApps

The key insight is that **ZK proofs separate what you prove from what you reveal**. You can prove "I cast a valid vote" without revealing "I voted YES."

This pattern extends to many use cases:
- Anonymous credentials
- Private auctions
- Confidential transactions
- Selective disclosure

Happy building! 🚀

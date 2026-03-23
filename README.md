# Midnight Example DApps

[![Generic badge](https://img.shields.io/badge/Compact%20Toolchain-0.28.0-1abc9c.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://shields.io/)

This repository contains two Midnight smart contract examples:

1. **Counter DApp** - A simple on-chain counter demonstrating basic Midnight contract development
2. **DAO Voting DApp** - A privacy-preserving voting system using zero-knowledge proofs

Both serve as starting points for building Midnight DApps.

## Available DApps

### Counter DApp
A simple counter that increments an on-chain value. Great for learning the basics of Midnight contract development.

### DAO Voting DApp
A privacy-preserving DAO voting contract that enables:
- **Private voting** - Individual votes remain hidden using zero-knowledge proofs
- **Public tallies** - Vote totals are visible on-chain for transparency
- **Multi-proposal support** - Create and vote on multiple proposals
- **Three vote types** - YES, NO, and APPEAL options

For detailed DAO documentation, see:
- [DAO-CONCEPTS.md](DAO-CONCEPTS.md) - Core concepts and architecture
- [DAO-DEPLOYMENT.md](DAO-DEPLOYMENT.md) - Deployment and API reference

## Network Targets

Supports three network targets:

| Network | Description | Command |
|---------|-------------|---------|
| **Preprod** | Public testnet (recommended for getting started) | `npm run preprod-ps` |
| **Preview** | Public preview testnet | `npm run preview-ps` |
| **Standalone** | Fully local (node + indexer + proof server via Docker) | `npm run standalone` |

## Project Structure

```
example-counter/
├── contract/                          # Smart contracts (Compact language)
│   ├── src/counter.compact            # Counter smart contract
│   ├── src/dao.compact                # DAO voting smart contract
│   ├── src/witnesses.ts               # Counter witness functions
│   ├── src/dao-witnesses.ts           # DAO witness functions
│   └── src/test/                      # Contract unit tests
└── counter-cli/                       # Command-line interfaces
    ├── src/api.ts                     # Counter contract API
    ├── src/cli.ts                     # Counter CLI interface
    ├── src/dao-api.ts                 # DAO contract API
    ├── src/dao-cli.ts                 # DAO CLI interface
    ├── src/dao-types.ts               # DAO TypeScript types
    ├── src/dao-storage.ts             # Local proposal storage
    ├── proof-server.yml               # Proof server Docker config (preprod/preview)
    ├── standalone.yml                 # Full local stack Docker config
    └── standalone.env.example         # Default env vars for standalone mode
```

## Prerequisites

- [Node.js v22.15+](https://nodejs.org/) — `node --version` to check
- [Docker](https://docs.docker.com/get-docker/) with `docker compose` — used for the local proof server

### Compact Developer Tools (devtools)

The Compact devtools manage and invoke the Compact toolchain (compiler, formatter, fixup tool, etc.).

Install the devtools and toolchain:

```bash
# Install the Compact devtools
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Add to PATH
source $HOME/.local/bin/env

# Install the toolchain version used by this project
compact update 0.28.0

# Verify
compact compile --version
```

> If you already have the devtools installed, run `compact self update` to get the latest version. If you encounter issues, `compact clean` will reset your `.compact` directory.

## Quick Start (Preprod)

### 1. Install dependencies

```bash
npm install
```

### 2. Build the smart contracts

```bash
cd contract
npm run compact:all    # Compiles both counter and DAO contracts
npm run build
npm run test
```

Expected output from `npm run compact:all`:

```
Compiling 1 circuits:
  circuit "increment" (k=10, rows=29)
Compiling 4 circuits:
  circuit "create_proposal" ...
  circuit "vote_yes" ...
  circuit "vote_no" ...
  circuit "vote_appeal" ...
```

The first run may download zero-knowledge parameters (~500MB). This is a one-time download.

### 3. Run a DApp

#### Counter DApp

Option A — **auto-start proof server** (recommended):

```bash
cd counter-cli
npm run preprod-ps
```

This pulls the proof server Docker image, starts it, and launches the Counter CLI.

#### DAO Voting DApp

```bash
cd counter-cli
npm run dao-ps    # Auto-starts proof server
# or
npm run dao       # Manual proof server (start separately)
```

This launches the DAO CLI for creating proposals and voting.

> **Mac ARM (Apple Silicon) users**: If the proof server hangs, enable Docker VMM in Docker Desktop: Settings → General → "Virtual Machine Options" → select **Docker VMM**. Restart Docker after changing.

Option B — **manual proof server** (if you prefer to manage it yourself):

Start the proof server in a separate terminal:

```bash
cd counter-cli
docker compose -f proof-server.yml up
```

Wait for it to start — you should see:

```
INFO actix_server::server: starting service: "actix-web-service-0.0.0.0:6300", workers: 24, listening on: 0.0.0.0:6300
```

Then in another terminal:

```bash
cd counter-cli
npm run preprod
```

## Using the Counter DApp

### Step 1: Create a wallet

The CLI uses a headless wallet (separate from browser wallets like Lace).

1. Choose option **[1]** to create a new wallet
2. The system generates a wallet seed and displays your addresses:

```
──────────────────────────────────────────────────────────────
  Wallet Overview                            Network: preprod
──────────────────────────────────────────────────────────────
  Seed: <64-character hex string>

  Unshielded Address (send tNight here):
  mn_addr_preprod1...
──────────────────────────────────────────────────────────────
```

**Save the seed** — you'll need it to restore the wallet later.

### Step 2: Fund your wallet

1. Copy your **unshielded address** (`mn_addr_preprod1...`) from the output
2. Visit the [Preprod faucet](https://faucet.preprod.midnight.network)
3. Paste your address and request tNight tokens
4. The CLI will detect incoming funds automatically

### Step 3: Wait for DUST

After receiving tNight, the CLI automatically registers your NIGHT UTXOs for dust generation. DUST is the non-transferable fee resource required for all transactions on Midnight.

The CLI shows progress:

```
  ✓ Registering 1 NIGHT UTXO(s) for dust generation
  ✓ Waiting for dust to generate
  ✓ Configuring providers
```

Once DUST is available, the contract menu appears with your balance:

```
──────────────────────────────────────────────────────────────
  Contract Actions                    DUST: 405,083,000,000,000
──────────────────────────────────────────────────────────────
  [1] Deploy a new counter contract
  [2] Join an existing counter contract
  [3] Monitor DUST balance
  [4] Exit
```

### Step 4: Deploy a counter contract

1. Choose option **[1]** to deploy
2. Wait for proving, balancing, and submission
3. The contract address is displayed on success:

```
  ✓ Deploying counter contract
  Contract deployed at: <contract address>
```

**Save the contract address** to rejoin the contract in future sessions.

### Step 5: Interact with your contract

After deployment, the counter menu appears:

- **[1] Increment counter** — submits a transaction to increment the on-chain counter
- **[2] Display current counter value** — queries the blockchain for the current value
- **[3] Exit**

Each increment creates a real transaction on Midnight Preprod.

### Returning to an existing wallet and contract

Next time you run the DApp:

1. Choose option **[2]** to restore wallet from seed
2. Enter your saved seed
3. Wait for sync and DUST generation
4. Choose option **[2]** to join existing contract
5. Enter your saved contract address

## Monitoring DUST Balance

The contract menu includes a DUST monitor (option **[3]**) that shows a live-updating display:

```
  [10:20:03 PM] DUST: 471,219,000,000,000 (1 coins, 0 pending) | NIGHT: 1 UTXOs, 1 registered | ✓ ready to deploy
```

This is useful for:
- Checking if you have enough DUST before deploying
- Monitoring DUST generation after registering NIGHT
- Diagnosing issues where DUST appears locked (pending coins from failed transactions)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `compact: command not found` | Run `source $HOME/.local/bin/env` to add it to your PATH. |
| `connect ECONNREFUSED 127.0.0.1:6300` | Start the proof server: `cd counter-cli && docker compose -f proof-server.yml up` |
| Proof server hangs on Mac ARM (Apple Silicon) | In Docker Desktop: Settings → General → "Virtual Machine Options" → select **Docker VMM**. Restart Docker after changing. |
| `Failed to clone intent` during deploy | Wallet SDK signing bug — already worked around in this codebase. If you see this, ensure you're running the latest code. See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) Section 4. |
| DUST balance drops to 0 after failed deploy | Known wallet SDK issue. Restart the DApp to release locked DUST coins. |
| Wallet shows 0 balance after faucet | Wait for sync to complete. If still 0, check that you sent to the correct unshielded address. |
| Could not find a working container runtime strategy | Docker isn't running. Start Docker and try again. |
| Tests fail with "Cannot find module" | Build the contract first: `cd contract && npm run compact && npm run build` |
| Node.js warnings about experimental features | Normal — these don't affect functionality. |

## Using the DAO Voting DApp

The DAO CLI provides a privacy-preserving voting interface:

### DAO Menu Options

After wallet setup, the DAO menu appears:

```
──────────────────────────────────────────────────────────────
  DAO Actions                           DUST: 405,083,000,000,000
──────────────────────────────────────────────────────────────
  [1] Deploy a new DAO contract
  [2] Join an existing DAO contract
  [3] Monitor DUST balance
  [4] Exit
```

### Creating Proposals

After deploying or joining a DAO contract:

1. Choose **Create Proposal**
2. Enter proposal details (type, title, description)
3. The proposal is created on-chain with a SHA-256 hash of the metadata

### Voting on Proposals

1. Choose **Vote on Proposal**
2. Select a proposal from the list
3. Choose your vote: **YES**, **NO**, or **APPEAL**
4. Your vote is cast privately using a zero-knowledge proof

### Privacy Model

| Data | Visibility |
|------|------------|
| Proposal metadata hash | **Public** (on-chain) |
| Vote commitments | **Public** (hashed, doesn't reveal vote) |
| Nullifiers | **Public** (prevents double-voting) |
| Vote totals (during voting) | **Hidden** (zero until poll closes) |
| Vote totals (after close) | **Public** (final results) |
| Individual votes | **Private** (hidden in commitment) |
| Voter identity | **Private** (cannot link to votes) |
| Voter secret | **Private** (never leaves client) |

**Privacy Features:**
- **Commitments**: Votes are hidden using cryptographic commitments
- **Nullifiers**: Prevent double-voting without revealing identity
- **Hidden Tallies**: Vote counts stay hidden until poll closure
- **ZK Proofs**: Prove vote validity without revealing the vote

For more details, see [DAO-CONCEPTS.md](DAO-CONCEPTS.md).

## Useful Links

- [Preprod Faucet](https://faucet.preprod.midnight.network) — Get preprod tNight tokens
- [Midnight Documentation](https://docs.midnight.network/) — Developer guide
- [Compact Language Guide](https://docs.midnight.network/compact) — Smart contract language reference
- [Migration Guide](MIGRATION_GUIDE.md) — Detailed guide for migrating to Preprod with midnight-js 3.0.0 and wallet-sdk-facade 1.0.0
- [DAO Concepts](DAO-CONCEPTS.md) — Deep dive into DAO architecture and zero-knowledge voting
- [DAO Deployment](DAO-DEPLOYMENT.md) — DAO contract API reference and deployment guide

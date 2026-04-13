# Midnight DAO Voting DApp

[![Generic badge](https://img.shields.io/badge/Compact%20Toolchain-0.5.1-1abc9c.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/Runtime-0.15.0-green.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/TypeScript-5.8.3-blue.svg)](https://shields.io/)

A privacy-preserving DAO voting contract using a **commit/reveal** scheme with cryptographically enforced privacy:

- **Commit/Reveal Voting** - Two-phase voting where votes are hidden during commit phase and revealed later
- **Circuit-Derived Nullifiers** - Nullifiers computed inside ZK circuits using `persistentCommit` to prevent double voting
- **MerkleTree Commitments** - Vote commitments stored in a MerkleTree for privacy
- **Tally Enforcement** - Vote tallies incremented inside the reveal circuit (cryptographically enforced)
- **Three vote types** - YES, NO, and APPEAL options
- **Proposal State Machine** - Proposals progress through COMMIT → REVEAL → FINAL phases

For detailed DAO documentation, see:
- [DAO-CONCEPTS.md](DAO-CONCEPTS.md) - Core concepts and architecture
- [DAO-DEPLOYMENT.md](DAO-DEPLOYMENT.md) - Deployment and API reference

## Network Targets

Supports Preprod testnet (recommended for getting started):

| Network | Description | Command |
|---------|-------------|---------|
| **Preprod** | Public testnet | `npm run start-ps` |

## Project Structure

```
example-dao/
├── contract/                          # Smart contracts (Compact language)
│   ├── src/dao.compact                # DAO voting smart contract
│   ├── src/dao-witnesses.ts           # DAO witness functions
│   └── src/test/                      # Contract unit tests
└── dao-cli/                           # Command-line interface
    ├── src/dao-api.ts                 # DAO contract API
    ├── src/dao-cli.ts                 # DAO CLI interface
    ├── src/dao-types.ts               # DAO TypeScript types
    ├── src/dao-storage.ts             # Local proposal storage
    └── proof-server.yml               # Proof server Docker config
```

## Prerequisites

- [Node.js v22.15+](https://nodejs.org/) — `node --version` to check
- [Docker](https://docs.docker.com/get-docker/) with `docker compose` — used for the local proof server

### Compact Developer Tools (devtools)

The Compact devtools manage and invoke the Compact toolchain (compiler, formatter, fixup tool, etc.).

Install the devtools and toolchain:

```bash
# Install the Compact devtools (v0.5.1)
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/download/compact-v0.5.1/compact-installer.sh | sh

# Add to PATH
source $HOME/.local/bin/env

# Verify installation
compact --version
```

> If you already have the devtools installed, run `compact self update` to get the latest version. If you encounter issues, `compact clean` will reset your `.compact` directory.

## Quick Start (Preprod)

### 1. Install dependencies

```bash
npm install
```

### 2. Build the smart contract

```bash
cd contract
npm run compact    # Compiles the DAO contract
npm run build
npm run test
```

Expected output from `npm run compact`:

```
Compiling 9 circuits:
  circuit "initialize_dao" (k=10, rows=898)
  circuit "add_eligible_voter" (k=13, rows=4609)
  circuit "create_proposal" (k=10, rows=585)
  circuit "vote_commit" (k=14, rows=15368)
  circuit "vote_reveal" (k=14, rows=11752)
  ...
```

The first run may download zero-knowledge parameters (~500MB). This is a one-time download.

### 3. Run the DAO CLI

Option A — **auto-start proof server** (recommended):

```bash
cd dao-cli
npm run start-ps
```

This pulls the proof server Docker image, starts it, and launches the DAO CLI.

> **Mac ARM (Apple Silicon) users**: If the proof server hangs, enable Docker VMM in Docker Desktop: Settings → General → "Virtual Machine Options" → select **Docker VMM**. Restart Docker after changing.

Option B — **manual proof server** (if you prefer to manage it yourself):

Start the proof server in a separate terminal:

```bash
cd dao-cli
docker compose -f proof-server.yml up
```

Wait for it to start — you should see:

```
INFO actix_server::server: starting service: "actix-web-service-0.0.0.0:6300", workers: 24, listening on: 0.0.0.0:6300
```

Then in another terminal:

```bash
cd dao-cli
npm run start
```

## Using the DAO Voting DApp

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

Once DUST is available, the DAO menu appears with your balance.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `compact: command not found` | Run `source $HOME/.local/bin/env` to add it to your PATH. |
| `connect ECONNREFUSED 127.0.0.1:6300` | Start the proof server: `cd dao-cli && docker compose -f proof-server.yml up` |
| Proof server hangs on Mac ARM (Apple Silicon) | In Docker Desktop: Settings → General → "Virtual Machine Options" → select **Docker VMM**. Restart Docker after changing. |
| `Failed to clone intent` during deploy | Wallet SDK signing bug — already worked around in this codebase. If you see this, ensure you're running the latest code. |
| DUST balance drops to 0 after failed deploy | Known wallet SDK issue. Restart the DApp to release locked DUST coins. |
| Wallet shows 0 balance after faucet | Wait for sync to complete. If still 0, check that you sent to the correct unshielded address. |
| Could not find a working container runtime strategy | Docker isn't running. Start Docker and try again. |
| Tests fail with "Cannot find module" | Build the contract first: `cd contract && npm run compact && npm run build` |
| Node.js warnings about experimental features | Normal — these don't affect functionality. |

## DAO Menu Options

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
3. The proposal is created on-chain (starts in **COMMIT** phase)

### Commit/Reveal Voting Flow

The DAO uses a **two-phase voting scheme** for cryptographic privacy:

**COMMIT Phase:**
1. Select a proposal in COMMIT phase
2. Choose your vote: **YES**, **NO**, or **APPEAL**
3. Your vote commitment is submitted (vote stays hidden)
4. Nullifier prevents double-commit

**REVEAL Phase:**
1. Admin advances proposal to REVEAL phase
2. Reveal your vote to increment the tally
3. Tally is incremented **inside the ZK circuit** (cryptographically enforced)

**FINAL Phase:**
1. Admin advances proposal to FINAL phase
2. Results are finalized and visible

### Privacy Model

| Data | Visibility |
|------|------------|
| Proposal metadata hash | **Public** (on-chain) |
| Vote commitments | **Public** (in MerkleTree, doesn't reveal vote) |
| Commit nullifiers | **Public** (prevents double-commit) |
| Reveal nullifiers | **Public** (prevents double-reveal) |
| Vote tallies (COMMIT phase) | **Hidden** (zero until reveals) |
| Vote tallies (REVEAL/FINAL) | **Public** (incremented in circuit) |
| Individual votes | **Private** (hidden in commitment) |
| Voter identity | **Private** (cannot link to votes) |
| Voter secret key | **Private** (never leaves client) |

**Cryptographic Enforcement:**
- **Circuit-derived nullifiers**: Using `persistentCommit`, nullifiers cannot be forged
- **MerkleTree commitments**: Vote choices hidden until reveal phase
- **Tally enforcement**: Incremented inside ZK circuit, cannot be manipulated
- **Round counter**: Prevents replay attacks across voting rounds

For more details, see [DAO-CONCEPTS.md](DAO-CONCEPTS.md).

## Known Good Stack

> **Always verify versions against the [Midnight Compatibility Matrix](https://docs.midnight.network/) before upgrading dependencies.**

| Component | Version | Notes |
|-----------|---------|-------|
| Compact devtools | 0.5.1 | `compact --version` |
| Compact toolchain | 0.30.0 | Installed via devtools |
| Compact runtime | 0.15.0 | `@midnight-ntwrk/compact-runtime` |
| Midnight.js | 4.0.4 | `@midnight-ntwrk/midnight-js` |
| Ledger | 8.0.3 | `@midnight-ntwrk/ledger-v8` |
| Proof server | 8.0.3 | Docker image tag |
| testkit-js | 4.0.4 | For simulator tests |
| Environment | Preprod | Public testnet |

**Local dev (standalone.yml):** Uses indexer `3.0.0` and node `0.20.0` for local testing. These may differ from preprod versions.

## Useful Links

- [Preprod Faucet](https://faucet.preprod.midnight.network) — Get preprod tNight tokens
- [Midnight Documentation](https://docs.midnight.network/) — Developer guide
- [Compact Language Guide](https://docs.midnight.network/compact) — Smart contract language reference
- [Migration Guide](MIGRATION_GUIDE.md) — Detailed guide for migrating to Preprod with midnight-js 3.0.0 and wallet-sdk-facade 1.0.0
- [DAO Concepts](DAO-CONCEPTS.md) — Deep dive into DAO architecture and zero-knowledge voting
- [DAO Deployment](DAO-DEPLOYMENT.md) — DAO contract API reference and deployment guide

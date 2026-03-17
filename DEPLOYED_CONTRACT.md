# Counter Smart Contract - Deployment Reference

**Network:** Preprod  
**Deployed:** February 21, 2026

---

## Contract Details

| Field | Value |
|-------|-------|
| **Contract Address** | `d367654634bb80def09c830b373839bd99076c040db135d0d39639d5328a2436` |
| **Network** | Preprod |
| **Current Counter Value** | 1 (after first increment) |

---

## Wallet Information

| Field | Value |
|-------|-------|
| **Seed** | `d06e924418821401cf3d7f5e3407893c9af1eb14645f91871c205f1b5d3b2ee3` |
| **Unshielded Address** | `mn_addr_preprod100n7vy7ql226m2l0vrdlsh82cf74ep6fzjl805u0pmhx3sz3zryq0dfzn3` |

> ⚠️ **IMPORTANT:** Keep your seed secure. Anyone with access to this seed can control your wallet.

---

## Contract Source (Compact)

```compact
pragma language_version >= 0.20;

import CompactStandardLibrary;

// public state
export ledger round: Counter;

// transition function changing public state
export circuit increment(): [] {
  round.increment(1);
}
```

**Location:** `contract/src/counter.compact`

---

## How to Interact with the Contract

### Prerequisites
- Node.js v22.15+
- Docker (for proof server)
- Compact devtools installed (`~/.local/bin/compact`)

### 1. Start the Proof Server

```bash
cd counter-cli
docker compose -f proof-server.yml up
```

Wait for: `INFO actix_server::server: starting service... listening on: 0.0.0.0:6300`

### 2. Run the CLI

```bash
cd counter-cli
npm run preprod
```

### 3. Restore Your Wallet

1. Choose option **[2]** to restore wallet from seed
2. Enter your seed: `d06e924418821401cf3d7f5e3407893c9af1eb14645f91871c205f1b5d3b2ee3`
3. Wait for sync and DUST generation

### 4. Join the Existing Contract

1. Choose option **[2]** to join existing contract
2. Enter contract address: `d367654634bb80def09c830b373839bd99076c040db135d0d39639d5328a2436`

### 5. Available Actions

| Option | Action | Description |
|--------|--------|-------------|
| **[1]** | Increment counter | Submits a transaction to increment the on-chain counter by 1 |
| **[2]** | Display current counter value | Queries the blockchain for the current value |
| **[3]** | Exit | Exit the CLI |

---

## Transaction History

| Timestamp | Action | Transaction ID | Block |
|-----------|--------|----------------|-------|
| 11:28:11 | Deploy | - | - |
| 11:29:58 | Increment (0→1) | `001df6f5052d94a14d33ec71375ca520790668de5a9874b67eef6c8f4d5f810f15` | 335116 |

---

## Useful Links

- [Preprod Faucet](https://faucet.preprod.midnight.network) — Get more tNight tokens
- [Midnight Documentation](https://docs.midnight.network/) — Developer guide
- [Compact Language Guide](https://docs.midnight.network/compact) — Smart contract language reference

---

## Quick Reference Commands

```bash
# Install dependencies
npm install

# Build contract
cd contract
npm run compact
npm run build
npm run test

# Run CLI (with auto proof server)
cd counter-cli
npm run preprod-ps

# Run CLI (manual proof server)
cd counter-cli
npm run preprod
```

# Known Good Stack

This file records the exact versions tested and verified for this repository.

**Last Updated:** April 2026

---

## Preprod Environment

| Component | Version | Package / Image |
|-----------|---------|-----------------|
| Compact devtools | 0.5.1 | `compact --version` |
| Compact toolchain | 0.30.0 | Installed via devtools |
| Compact runtime | 0.15.0 | `@midnight-ntwrk/compact-runtime` |
| Compact JS | 2.5.0 | `@midnight-ntwrk/compact-js` |
| Midnight.js | 4.0.4 | `@midnight-ntwrk/midnight-js` |
| Ledger | 8.0.3 | `@midnight-ntwrk/ledger-v8` |
| Proof server | 8.0.3 | `midnightntwrk/proof-server:8.0.3` |
| testkit-js | 4.0.4 | `@midnight-ntwrk/testkit-js` |
| DApp Connector API | 4.0.1 | — |
| Midnight Indexer | 4.0.1 | — |

---

## Local Development (standalone.yml)

| Component | Version | Notes |
|-----------|---------|-------|
| Proof server | 8.0.3 | Same as preprod |
| Indexer | 3.0.0 | `midnightntwrk/indexer-standalone:3.0.0` |
| Node | 0.20.0 | `midnightntwrk/midnight-node:0.20.0` |

> **Note:** Local dev versions may differ from preprod. The standalone environment is for testing only.

---

## Wallet SDK

| Package | Version |
|---------|---------|
| wallet-sdk-address-format | 3.0.0 |
| wallet-sdk-dust-wallet | 3.0.0 |
| wallet-sdk-facade | 3.0.0 |
| wallet-sdk-hd | 3.0.0 |
| wallet-sdk-shielded | 2.0.0 |
| wallet-sdk-unshielded-wallet | 2.0.0 |

---

## Node.js & TypeScript

| Tool | Version |
|------|---------|
| Node.js | 22.15+ |
| TypeScript | 5.9.3 |

---

## Verification Commands

```bash
# Check Compact devtools version
compact --version

# Check Node.js version
node --version

# Check installed package versions
npm ls @midnight-ntwrk/compact-runtime
npm ls @midnight-ntwrk/midnight-js

# Check proof server image
docker images midnightntwrk/proof-server
```

---

## Compatibility Matrix Reference

Always verify against the official Midnight Compatibility Matrix before upgrading:

**Source:** [Midnight Documentation → Release Notes → Compatibility Matrix](https://docs.midnight.network/)

### Update Rules

1. **Never mix versions** — Proof server, ledger, runtime, and SDK must be compatible
2. **Check the matrix first** — Before upgrading any component
3. **Test end-to-end** — After any version change, run a full deploy + transaction test
4. **Update this file** — Record the new working versions after verification

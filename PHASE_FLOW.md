# DAO Voting Phase Flow

This document describes the complete lifecycle of a DAO proposal from initialization through final results.

---

## Overview

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  INITIALIZE  │───►│    SETUP     │───►│    COMMIT    │───►│    REVEAL    │───►│    FINAL     │
│              │    │              │    │              │    │              │    │              │
│ One-time DAO │    │ Add voters,  │    │ Voters cast  │    │ Voters reveal│    │ Results are  │
│ setup        │    │ create props │    │ hidden votes │    │ their votes  │    │ finalized    │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Phase 1: Initialize DAO

**Circuit:** `initialize_dao`

**Who:** First deployer (becomes implicit admin setter)

**Actions:**
1. Deploy the contract
2. Call `initialize_dao(admin0, admin1, admin2)` with 3 admin public keys
3. DAO is now initialized and cannot be re-initialized

**State Changes:**
- `adminPubKeys[0..2]` ← admin public keys
- `daoInitialized[0]` ← true
- `currentBlockHeight[0]` ← 0

**Security:**
- Can only be called once (`daoInitialized` flag)
- First caller sets all admin keys

---

## Phase 2: Admin Setup

**Circuits:** `add_eligible_voter`, `update_block_height`

**Who:** Any admin (proof of admin secret required)

**Actions:**

### Add Eligible Voters
```
add_eligible_voter(voterPubKey, adminSecret)
```
- Admin proves knowledge of admin secret
- Voter's public key added to `eligibleVoters` Merkle tree

### Update Block Height
```
update_block_height(newHeight, adminSecret)
```
- Admin proves knowledge of admin secret
- Block height can only increase (monotonic)

**Security:**
- Requires valid admin secret that derives to stored admin pubkey
- Voter registration is permanent (no removal in current design)

---

## Phase 3: Create Proposal

**Circuit:** `create_proposal`

**Who:** Anyone (no auth required in current design)

**Actions:**
```
create_proposal(proposalId, metaHash, commitDuration, revealDuration)
```

**Parameters:**
| Parameter | Description |
|-----------|-------------|
| `proposalId` | Unique identifier for the proposal |
| `metaHash` | Hash of proposal metadata (title, description, etc.) |
| `commitDuration` | Number of blocks for commit phase |
| `revealDuration` | Number of blocks for reveal phase |

**State Changes:**
- `proposalCount` ← incremented
- `proposalMeta[pid]` ← metaHash
- `proposalState[pid]` ← COMMIT
- `commitDeadline[pid]` ← currentBlockHeight + commitDuration
- `revealDeadline[pid]` ← commitDeadline + revealDuration
- `proposalVotesYes/No/Appeal[pid]` ← 0
- `proposalTotalVotes[pid]` ← 0
- `proposalQuorumReached[pid]` ← false

**Proposal starts in COMMIT phase immediately.**

---

## Phase 4: Commit Phase

**Circuit:** `vote_commit`

**Who:** Eligible voters only

**Actions:**
```
vote_commit(proposalId, ballot)
```

**Ballot values:**
| Value | Meaning |
|-------|---------|
| 0 | NO |
| 1 | YES |
| 2 | APPEAL |

**What Happens:**
1. Voter provides secret key via witness
2. Circuit verifies voter is in `eligibleVoters` Merkle tree
3. Circuit derives commit nullifier: `persistentCommit({pid, round, "dao:cn"}, sk)`
4. Circuit checks nullifier not already used
5. Circuit derives vote commitment: `persistentCommit({ballot, pid, round}, sk)`
6. Commitment stored in `voteCommitments` Merkle tree
7. Nullifier stored in `commitNullifiers` set

**Privacy:**
- Vote choice is hidden in the commitment
- Nullifier prevents double-commit but doesn't reveal identity
- Observer sees: commitment added, nullifier added
- Observer cannot see: who voted, what they voted

**Deadline:** Must be before `commitDeadline[pid]`

---

## Phase 5: Transition to Reveal

**Circuits:** `advance_proposal_by_time` or `advance_proposal_multisig`

### Option A: Time-Based (Anyone)
```
advance_proposal_by_time(proposalId)
```
- Requires: `currentBlockHeight > commitDeadline[pid]`
- No auth needed — anyone can trigger after deadline

### Option B: Multi-Sig (Early Transition)
```
advance_proposal_multisig(proposalId, adminSecret0, adminSecret1)
```
- Requires: 2 different admin secrets
- Can transition before deadline

**State Changes:**
- `proposalState[pid]` ← REVEAL

---

## Phase 6: Reveal Phase

**Circuit:** `vote_reveal`

**Who:** Voters who committed

**Actions:**
```
vote_reveal(proposalId)
```

**What Happens:**
1. Voter provides secret key and vote choice via witnesses
2. Circuit derives reveal nullifier: `persistentCommit({pid, round, "dao:rn"}, sk)`
3. Circuit checks reveal nullifier not already used
4. Circuit recomputes commitment from same inputs
5. Circuit verifies commitment exists in `voteCommitments` Merkle tree
6. **Circuit increments the appropriate tally** (YES/NO/APPEAL)
7. Circuit updates total vote count
8. Circuit checks quorum (≥3 votes)
9. Reveal nullifier stored

**Tally Enforcement:**
```compact
if (ballotVal == 1) {
  proposalVotesYes.insert(pid, currentYes + 1);
} else if (ballotVal == 0) {
  proposalVotesNo.insert(pid, currentNo + 1);
} else {
  proposalVotesAppeal.insert(pid, currentAppeal + 1);
}
```

**Security:**
- Tally incremented INSIDE the circuit — cannot be manipulated
- Must reveal same vote that was committed (commitment must match)
- Cannot reveal without having committed (commitment must exist in tree)
- Cannot reveal twice (reveal nullifier check)

**Deadline:** Must be before `revealDeadline[pid]`

---

## Phase 7: Transition to Final

**Circuits:** `advance_proposal_by_time` or `advance_proposal_multisig`

Same as commit→reveal transition, but:
- Time-based requires: `currentBlockHeight > revealDeadline[pid]`
- Also increments the global `round` counter

**State Changes:**
- `proposalState[pid]` ← FINAL
- `round` ← incremented

---

## Phase 8: Final Results

**Circuit:** `check_proposal_result`

**Who:** Anyone (read-only check)

**Actions:**
```
check_proposal_result(proposalId)
```

**Checks:**
- Proposal is in FINAL state
- Quorum was reached (≥3 votes)

**Result Interpretation:**
- **Passed:** `proposalVotesYes > proposalVotesNo`
- **Failed:** `proposalVotesNo >= proposalVotesYes`
- **Appeal:** If `proposalVotesAppeal` is significant (interpretation depends on governance rules)

---

## State Machine Summary

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
┌────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐    │
│ SETUP  │───►│  COMMIT  │───►│  REVEAL  │───►│  FINAL  │────┘
└────────┘    └──────────┘    └──────────┘    └─────────┘
                    │              │
                    │              │
              vote_commit    vote_reveal
              (hidden)       (tally updated)
```

---

## Timing Diagram

```
Block Height:  0        100              200              300
               │         │                │                │
               ▼         ▼                ▼                ▼
Timeline:  ────┬─────────┬────────────────┬────────────────┬────────
               │         │                │                │
               │ CREATE  │  COMMIT PHASE  │  REVEAL PHASE  │ FINAL
               │         │                │                │
               │         │ commitDeadline │ revealDeadline │
               │         │      ▼         │       ▼        │
               │         └────────────────┴────────────────┘
```

---

## Error Conditions

| Phase | Error | Cause |
|-------|-------|-------|
| Commit | "Not in commit phase" | Proposal already advanced |
| Commit | "Commit phase ended" | Past deadline |
| Commit | "Voter not authorized" | Not in eligibleVoters tree |
| Commit | "Already committed" | Nullifier already used |
| Reveal | "Not in reveal phase" | Wrong phase |
| Reveal | "Reveal phase ended" | Past deadline |
| Reveal | "Already revealed" | Reveal nullifier used |
| Reveal | "Commitment not found" | Didn't commit or wrong inputs |
| Advance | "Commit/Reveal phase not ended" | Before deadline (time-based) |
| Advance | "Must be 2 different admins" | Same admin secret twice |

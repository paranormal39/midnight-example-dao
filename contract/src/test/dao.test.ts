// This file is part of midnightntwrk/example-counter.
// Copyright (C) 2025 Midnight Foundation
// SPDX-License-Identifier: Apache-2.0
// Licensed under the Apache License, Version 2.0 (the "License");
// You may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { DaoSimulator, computeNullifier } from "./dao-simulator.js";
import { VoteChoice } from "../dao-witnesses.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "crypto";

setNetworkId("undeployed");

// Helper to create a proposal metadata hash
function createMetaHash(title: string): Uint8Array {
  return createHash('sha256').update(JSON.stringify({ title })).digest();
}

describe("DAO Privacy-Preserving Voting Contract", () => {
  describe("Initialization", () => {
    it("generates initial ledger state deterministically", () => {
      const voterSecret = randomBytes(32);
      const simulator0 = new DaoSimulator(voterSecret);
      const simulator1 = new DaoSimulator(voterSecret);
      expect(simulator0.getLedger().proposalCount).toEqual(simulator1.getLedger().proposalCount);
    });

    it("properly initializes ledger state", () => {
      const simulator = new DaoSimulator();
      const initialLedgerState = simulator.getLedger();
      expect(initialLedgerState.proposalCount).toEqual(0n);
    });

    it("properly initializes private state with voter secret", () => {
      const voterSecret = randomBytes(32);
      const simulator = new DaoSimulator(voterSecret);
      const privateState = simulator.getPrivateState();
      expect(privateState.voterSecret).toEqual(voterSecret);
      expect(privateState.currentVoteChoice).toEqual(VoteChoice.YES);
    });
  });

  describe("Proposal Creation", () => {
    it("creates a proposal correctly", () => {
      const simulator = new DaoSimulator();
      const metaHash = createMetaHash("Test Proposal");
      
      const ledger = simulator.createProposal(0n, metaHash);
      
      expect(ledger.proposalCount).toEqual(1n);
    });

    it("creates multiple proposals with incrementing IDs", () => {
      const simulator = new DaoSimulator();
      
      simulator.createProposal(0n, createMetaHash("Proposal 1"));
      simulator.createProposal(1n, createMetaHash("Proposal 2"));
      const ledger = simulator.createProposal(2n, createMetaHash("Proposal 3"));
      
      expect(ledger.proposalCount).toEqual(3n);
    });

    it("initializes proposal with active status (0)", () => {
      const simulator = new DaoSimulator();
      const metaHash = createMetaHash("Test Proposal");
      
      const ledger = simulator.createProposal(0n, metaHash);
      
      // Status 0 = active
      const status = ledger.proposalStatus.lookup(0n);
      expect(status).toEqual(0n);
    });

    it("initializes vote tallies to zero", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      const ledger = simulator.getLedger();
      
      expect(ledger.votesYes.lookup(0n)).toEqual(0n);
      expect(ledger.votesNo.lookup(0n)).toEqual(0n);
      expect(ledger.votesAppeal.lookup(0n)).toEqual(0n);
    });

    it("initializes vote count to zero", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      expect(simulator.getVoteCount(0n)).toEqual(0n);
    });
  });

  describe("Private Voting", () => {
    it("casts a YES vote and increments vote count", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.castVote(0n, VoteChoice.YES);
      
      expect(simulator.getVoteCount(0n)).toEqual(1n);
    });

    it("casts a NO vote and increments vote count", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.castVote(0n, VoteChoice.NO);
      
      expect(simulator.getVoteCount(0n)).toEqual(1n);
    });

    it("casts an APPEAL vote and increments vote count", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.castVote(0n, VoteChoice.APPEAL);
      
      expect(simulator.getVoteCount(0n)).toEqual(1n);
    });

    it("stores nullifier to prevent double voting", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.castVote(0n, VoteChoice.YES);
      
      // Compute expected nullifier
      const voterSecret = simulator.getVoterSecret();
      const expectedNullifier = computeNullifier(voterSecret, 0n);
      
      expect(simulator.isNullifierUsed(expectedNullifier)).toBe(true);
    });

    it("keeps vote tallies hidden (zero) while voting is active", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      // Cast a vote
      simulator.castVote(0n, VoteChoice.YES);
      
      const ledger = simulator.getLedger();
      
      // Tallies should still be zero (hidden until close)
      expect(ledger.votesYes.lookup(0n)).toEqual(0n);
      expect(ledger.votesNo.lookup(0n)).toEqual(0n);
      expect(ledger.votesAppeal.lookup(0n)).toEqual(0n);
    });
  });

  describe("Proposal Closure", () => {
    it("closes proposal and reveals final tallies", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      simulator.castVote(0n, VoteChoice.YES);
      
      // Close with final tallies (in real scenario, these would be computed off-chain)
      const ledger = simulator.closeProposal(0n, 1n, 0n, 0n);
      
      expect(ledger.votesYes.lookup(0n)).toEqual(1n);
      expect(ledger.votesNo.lookup(0n)).toEqual(0n);
      expect(ledger.votesAppeal.lookup(0n)).toEqual(0n);
    });

    it("sets proposal status to closed (1)", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      const ledger = simulator.closeProposal(0n, 5n, 3n, 1n);
      
      expect(ledger.proposalStatus.lookup(0n)).toEqual(1n);
    });
  });

  describe("Privacy Guarantees", () => {
    it("different voters produce different nullifiers for same proposal", () => {
      const voter1Secret = randomBytes(32);
      const voter2Secret = randomBytes(32);
      
      const nullifier1 = computeNullifier(voter1Secret, 0n);
      const nullifier2 = computeNullifier(voter2Secret, 0n);
      
      expect(Buffer.from(nullifier1).equals(Buffer.from(nullifier2))).toBe(false);
    });

    it("same voter produces different nullifiers for different proposals", () => {
      const voterSecret = randomBytes(32);
      
      const nullifier0 = computeNullifier(voterSecret, 0n);
      const nullifier1 = computeNullifier(voterSecret, 1n);
      
      expect(Buffer.from(nullifier0).equals(Buffer.from(nullifier1))).toBe(false);
    });
  });
});

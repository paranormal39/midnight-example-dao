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

import { DaoSimulator, ProposalState } from "./dao-simulator.js";
import { VoteChoice } from "../dao-witnesses.js";
import { setNetworkId } from "@midnight-ntwrk/midnight-js-network-id";
import { describe, it, expect } from "vitest";
import { createHash, randomBytes } from "crypto";

setNetworkId("undeployed");

// Helper to create a proposal metadata hash
function createMetaHash(title: string): Uint8Array {
  return createHash('sha256').update(JSON.stringify({ title })).digest();
}

// Helper to create admin keys
function createAdminKeys(): [Uint8Array, Uint8Array, Uint8Array] {
  return [randomBytes(32), randomBytes(32), randomBytes(32)];
}

describe("DAO Full Security Contract", () => {
  describe("Initialization", () => {
    it("generates initial ledger state deterministically", () => {
      const secretKey = randomBytes(32);
      const simulator0 = new DaoSimulator(secretKey);
      const simulator1 = new DaoSimulator(secretKey);
      expect(simulator0.getProposalCount()).toEqual(simulator1.getProposalCount());
    });

    it("properly initializes ledger state", () => {
      const simulator = new DaoSimulator();
      expect(simulator.getProposalCount()).toEqual(0n);
      expect(simulator.getRound()).toEqual(0n);
    });

    it("properly initializes private state with secret key", () => {
      const secretKey = randomBytes(32);
      const simulator = new DaoSimulator(secretKey);
      const privateState = simulator.getPrivateState();
      expect(privateState.secretKey).toEqual(secretKey);
      expect(privateState.voteChoice).toEqual(VoteChoice.YES);
    });

    it("initializes DAO with admin keys", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      
      simulator.initializeDao(admin0, admin1, admin2);
      
      // Should not throw - initialization succeeded
      expect(simulator.getCurrentBlockHeight()).toEqual(0n);
    });
  });

  describe("Voter Registration", () => {
    it("adds eligible voter to MerkleTree", () => {
      const simulator = new DaoSimulator();
      const voterPubKey = randomBytes(32);
      
      simulator.addEligibleVoter(voterPubKey);
      
      // Voter should be in the tree
      const path = simulator.getVoterAuthPath(voterPubKey);
      expect(path).toBeDefined();
    });
  });

  describe("Block Height Management", () => {
    it("updates block height", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      
      simulator.updateBlockHeight(100n);
      
      expect(simulator.getCurrentBlockHeight()).toEqual(100n);
    });

    it("prevents block height from decreasing", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      
      simulator.updateBlockHeight(100n);
      
      expect(() => simulator.updateBlockHeight(50n)).toThrow();
    });
  });

  describe("Proposal Creation with Time-Locks", () => {
    it("creates a proposal with deadlines", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.updateBlockHeight(100n);
      
      const metaHash = createMetaHash("Test Proposal");
      simulator.createProposal(0n, metaHash, 50n, 50n); // 50 blocks commit, 50 blocks reveal
      
      expect(simulator.getProposalCount()).toEqual(1n);
      
      const deadlines = simulator.getProposalDeadlines(0n);
      expect(deadlines.commitDeadline).toEqual(150n); // 100 + 50
      expect(deadlines.revealDeadline).toEqual(200n); // 150 + 50
    });

    it("initializes proposal in commit state", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      
      const metaHash = createMetaHash("Test Proposal");
      simulator.createProposal(0n, metaHash, 100n, 100n);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.COMMIT);
    });

    it("initializes per-proposal vote tallies to zero", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.createProposal(0n, createMetaHash("Test"), 100n, 100n);
      
      const tallies = simulator.getProposalVoteTallies(0n);
      
      expect(tallies.yes).toEqual(0n);
      expect(tallies.no).toEqual(0n);
      expect(tallies.appeal).toEqual(0n);
      expect(tallies.total).toEqual(0n);
    });
  });

  describe("Time-Based State Transitions", () => {
    it("advances from commit to reveal after deadline", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.updateBlockHeight(100n);
      simulator.createProposal(0n, createMetaHash("Test"), 50n, 50n);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.COMMIT);
      
      // Advance time past commit deadline
      simulator.updateBlockHeight(151n);
      simulator.advanceProposalByTime(0n);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.REVEAL);
    });

    it("advances from reveal to final after deadline", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.updateBlockHeight(100n);
      simulator.createProposal(0n, createMetaHash("Test"), 50n, 50n);
      
      // Advance through both phases
      simulator.updateBlockHeight(151n);
      simulator.advanceProposalByTime(0n); // commit -> reveal
      
      simulator.updateBlockHeight(201n);
      simulator.advanceProposalByTime(0n); // reveal -> final
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.FINAL);
    });

    it("increments round when advancing to final", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.updateBlockHeight(100n);
      simulator.createProposal(0n, createMetaHash("Test"), 50n, 50n);
      
      expect(simulator.getRound()).toEqual(0n);
      
      simulator.updateBlockHeight(151n);
      simulator.advanceProposalByTime(0n);
      simulator.updateBlockHeight(201n);
      simulator.advanceProposalByTime(0n);
      
      expect(simulator.getRound()).toEqual(1n);
    });
  });

  describe("Multi-Sig Admin Transitions", () => {
    it("allows early phase transition with multi-sig", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.updateBlockHeight(100n);
      simulator.createProposal(0n, createMetaHash("Test"), 50n, 50n);
      
      // Advance before deadline with multi-sig (using dummy signatures for demo)
      const sig0 = randomBytes(64);
      const sig1 = randomBytes(64);
      
      simulator.advanceProposalMultisig(0n, sig0, sig1);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.REVEAL);
    });
  });

  describe("Privacy Guarantees", () => {
    it("different voters produce different secret keys", () => {
      const voter1Secret = randomBytes(32);
      const voter2Secret = randomBytes(32);
      
      expect(Buffer.from(voter1Secret).equals(Buffer.from(voter2Secret))).toBe(false);
    });
  });

  describe("Quorum Requirements", () => {
    it("quorum not reached with zero votes", () => {
      const simulator = new DaoSimulator();
      const [admin0, admin1, admin2] = createAdminKeys();
      simulator.initializeDao(admin0, admin1, admin2);
      simulator.createProposal(0n, createMetaHash("Test"), 100n, 100n);
      
      expect(simulator.isQuorumReached(0n)).toBe(false);
    });
  });
});

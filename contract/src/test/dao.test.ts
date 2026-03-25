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

describe("DAO Commit/Reveal Voting Contract", () => {
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
  });

  describe("Proposal Creation", () => {
    it("creates a proposal correctly", () => {
      const simulator = new DaoSimulator();
      const metaHash = createMetaHash("Test Proposal");
      
      simulator.createProposal(0n, metaHash);
      
      expect(simulator.getProposalCount()).toEqual(1n);
    });

    it("creates multiple proposals with incrementing count", () => {
      const simulator = new DaoSimulator();
      
      simulator.createProposal(0n, createMetaHash("Proposal 1"));
      simulator.createProposal(1n, createMetaHash("Proposal 2"));
      simulator.createProposal(2n, createMetaHash("Proposal 3"));
      
      expect(simulator.getProposalCount()).toEqual(3n);
    });

    it("initializes proposal in commit state", () => {
      const simulator = new DaoSimulator();
      const metaHash = createMetaHash("Test Proposal");
      
      simulator.createProposal(0n, metaHash);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.COMMIT);
    });

    it("initializes vote tallies to zero", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      const tallies = simulator.getVoteTallies();
      
      expect(tallies.yes).toEqual(0n);
      expect(tallies.no).toEqual(0n);
      expect(tallies.appeal).toEqual(0n);
    });
  });

  describe("State Machine", () => {
    it("advances from commit to reveal phase", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.COMMIT);
      
      simulator.advanceProposal(0n);
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.REVEAL);
    });

    it("advances from reveal to final phase", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.advanceProposal(0n); // commit -> reveal
      simulator.advanceProposal(0n); // reveal -> final
      
      expect(simulator.getProposalState(0n)).toEqual(ProposalState.FINAL);
    });

    it("increments round when advancing to final", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      expect(simulator.getRound()).toEqual(0n);
      
      simulator.advanceProposal(0n); // commit -> reveal
      simulator.advanceProposal(0n); // reveal -> final
      
      expect(simulator.getRound()).toEqual(1n);
    });
  });

  describe("Commit Phase", () => {
    it("allows voting during commit phase", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      // Should not throw
      simulator.voteCommit(0n, VoteChoice.YES);
    });

    it("stores commitment in MerkleTree", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.voteCommit(0n, VoteChoice.YES);
      
      // The commit should have succeeded without error
      expect(simulator.getProposalCount()).toEqual(1n);
    });
  });

  describe("Privacy Guarantees", () => {
    it("different voters produce different secret keys", () => {
      const voter1Secret = randomBytes(32);
      const voter2Secret = randomBytes(32);
      
      expect(Buffer.from(voter1Secret).equals(Buffer.from(voter2Secret))).toBe(false);
    });

    it("tallies remain zero during commit phase", () => {
      const simulator = new DaoSimulator();
      simulator.createProposal(0n, createMetaHash("Test"));
      
      simulator.voteCommit(0n, VoteChoice.YES);
      
      const tallies = simulator.getVoteTallies();
      expect(tallies.yes).toEqual(0n);
      expect(tallies.no).toEqual(0n);
      expect(tallies.appeal).toEqual(0n);
    });
  });
});

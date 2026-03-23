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

import {
  type CircuitContext,
  sampleContractAddress,
  createConstructorContext,
  createCircuitContext
} from "@midnight-ntwrk/compact-runtime";
import {
  Contract,
  type Ledger,
  ledger
} from "../managed/dao/contract/index.js";
import { 
  type DaoPrivateState, 
  daoWitnesses, 
  VoteChoice,
  createDaoPrivateState,
  withVoteChoice 
} from "../dao-witnesses.js";
import { createHash, randomBytes } from "crypto";

// Helper to compute nullifier (must match contract logic)
export function computeNullifier(voterSecret: Uint8Array, proposalId: bigint): Uint8Array {
  const proposalIdBytes = bigintToBytes32(proposalId);
  const combined = Buffer.concat([voterSecret, proposalIdBytes]);
  return createHash('sha256').update(combined).digest();
}

// Convert bigint to 32-byte buffer (little-endian)
function bigintToBytes32(n: bigint): Buffer {
  const buf = Buffer.alloc(32);
  let remaining = n;
  for (let i = 0; i < 32; i++) {
    buf[i] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return buf;
}

export class DaoSimulator {
  readonly contract: Contract<DaoPrivateState>;
  circuitContext: CircuitContext<DaoPrivateState>;
  private voterSecret: Uint8Array;

  constructor(voterSecret?: Uint8Array) {
    this.voterSecret = voterSecret ?? randomBytes(32);
    this.contract = new Contract<DaoPrivateState>(daoWitnesses);
    const initialPrivateState = createDaoPrivateState(this.voterSecret);
    
    const {
      currentPrivateState,
      currentContractState,
      currentZswapLocalState
    } = this.contract.initialState(
      createConstructorContext(initialPrivateState, "0".repeat(64))
    );
    this.circuitContext = createCircuitContext(
      sampleContractAddress(),
      currentZswapLocalState,
      currentContractState,
      currentPrivateState
    );
  }

  public getLedger(): Ledger {
    return ledger(this.circuitContext.currentQueryContext.state);
  }

  public getPrivateState(): DaoPrivateState {
    return this.circuitContext.currentPrivateState;
  }

  public getVoterSecret(): Uint8Array {
    return this.voterSecret;
  }

  public createProposal(proposalId: bigint, metaHash: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.create_proposal(
      this.circuitContext,
      proposalId,
      metaHash
    ).context;
    return this.getLedger();
  }

  public castVote(proposalId: bigint, voteChoice: VoteChoice): Ledger {
    // Update private state with vote choice
    const updatedPrivateState = withVoteChoice(
      this.circuitContext.currentPrivateState,
      voteChoice
    );
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: updatedPrivateState
    };

    // Compute nullifier
    const nullifier = computeNullifier(this.voterSecret, proposalId);
    
    // Get current vote count
    const currentVoteCount = this.getLedger().voteCount.lookup(proposalId) ?? 0n;

    // Call the circuit
    this.circuitContext = this.contract.impureCircuits.cast_vote(
      this.circuitContext,
      proposalId,
      nullifier,
      currentVoteCount
    ).context;
    
    return this.getLedger();
  }

  public closeProposal(
    proposalId: bigint,
    finalYes: bigint,
    finalNo: bigint,
    finalAppeal: bigint
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.close_proposal(
      this.circuitContext,
      proposalId,
      finalYes,
      finalNo,
      finalAppeal
    ).context;
    return this.getLedger();
  }

  // Helper to check if a nullifier has been used
  public isNullifierUsed(nullifier: Uint8Array): boolean {
    const ledgerState = this.getLedger();
    const used = ledgerState.usedNullifiers.lookup(nullifier);
    return used !== undefined && used === 1n;
  }

  // Helper to get vote count for a proposal
  public getVoteCount(proposalId: bigint): bigint {
    const ledgerState = this.getLedger();
    return ledgerState.voteCount.lookup(proposalId) ?? 0n;
  }
}

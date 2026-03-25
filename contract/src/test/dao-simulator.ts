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
  type MerkleTreePath,
  daoWitnesses, 
  VoteChoice,
  createDaoPrivateState,
  withVoteChoice,
  withCommitmentPath
} from "../dao-witnesses.js";
import { randomBytes } from "crypto";

// Proposal state enum (must match contract)
export enum ProposalState {
  SETUP = 0,
  COMMIT = 1,
  REVEAL = 2,
  FINAL = 3,
}

export class DaoSimulator {
  readonly contract: Contract<DaoPrivateState>;
  circuitContext: CircuitContext<DaoPrivateState>;
  private secretKey: Uint8Array;
  
  // Track commitments for building MerkleTree paths
  private commitmentsList: Uint8Array[] = [];

  constructor(secretKey?: Uint8Array) {
    this.secretKey = secretKey ?? randomBytes(32);
    this.contract = new Contract<DaoPrivateState>(daoWitnesses);
    const initialPrivateState = createDaoPrivateState(this.secretKey);
    
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

  public getSecretKey(): Uint8Array {
    return this.secretKey;
  }

  // Create a new proposal (starts in commit phase)
  public createProposal(proposalId: bigint, metaHash: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.create_proposal(
      this.circuitContext,
      proposalId,
      metaHash
    ).context;
    return this.getLedger();
  }

  // Commit phase: voter commits their vote
  public voteCommit(proposalId: bigint, voteChoice: VoteChoice): Ledger {
    // Update private state with vote choice
    const updatedPrivateState = withVoteChoice(
      this.circuitContext.currentPrivateState,
      voteChoice
    );
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: updatedPrivateState
    };

    // Call the vote_commit circuit
    this.circuitContext = this.contract.impureCircuits.vote_commit(
      this.circuitContext,
      proposalId
    ).context;
    
    return this.getLedger();
  }

  // Reveal phase: voter reveals their vote and tally is incremented
  public voteReveal(proposalId: bigint, voteChoice: VoteChoice, commitmentPath: MerkleTreePath): Ledger {
    // Update private state with vote choice and commitment path
    let updatedPrivateState = withVoteChoice(
      this.circuitContext.currentPrivateState,
      voteChoice
    );
    updatedPrivateState = withCommitmentPath(
      updatedPrivateState,
      commitmentPath.leaf,
      commitmentPath
    );
    this.circuitContext = {
      ...this.circuitContext,
      currentPrivateState: updatedPrivateState
    };

    // Call the vote_reveal circuit
    this.circuitContext = this.contract.impureCircuits.vote_reveal(
      this.circuitContext,
      proposalId
    ).context;
    
    return this.getLedger();
  }

  // Advance proposal state: commit -> reveal -> final
  public advanceProposal(proposalId: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.advance_proposal(
      this.circuitContext,
      proposalId
    ).context;
    return this.getLedger();
  }

  // Get proposal state (returns number: 0=setup, 1=commit, 2=reveal, 3=final)
  public getProposalState(proposalId: bigint): ProposalState | undefined {
    const ledgerState = this.getLedger();
    if (!ledgerState.proposalState.member(proposalId)) return undefined;
    const state = ledgerState.proposalState.lookup(proposalId);
    return state as ProposalState;
  }

  // Get vote tallies
  public getVoteTallies(): { yes: bigint; no: bigint; appeal: bigint } {
    const ledgerState = this.getLedger();
    return {
      yes: ledgerState.votesYes,
      no: ledgerState.votesNo,
      appeal: ledgerState.votesAppeal,
    };
  }

  // Check if a commit nullifier has been used
  public isCommitNullifierUsed(nullifier: Uint8Array): boolean {
    const ledgerState = this.getLedger();
    return ledgerState.commitNullifiers.member(nullifier);
  }

  // Check if a reveal nullifier has been used
  public isRevealNullifierUsed(nullifier: Uint8Array): boolean {
    const ledgerState = this.getLedger();
    return ledgerState.revealNullifiers.member(nullifier);
  }

  // Get current round
  public getRound(): bigint {
    const ledgerState = this.getLedger();
    return ledgerState.round;
  }

  // Get proposal count
  public getProposalCount(): bigint {
    const ledgerState = this.getLedger();
    return ledgerState.proposalCount;
  }
}

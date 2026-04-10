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
  ledger,
  pureCircuits
} from "../managed/dao/contract/index.js";
import { 
  type DaoPrivateState, 
  type MerkleTreePath,
  daoWitnesses, 
  VoteChoice,
  createDaoPrivateState,
  withVoteChoice,
  withCommitmentPath,
  withVoterAuthPath
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

  // Derive public key from secret using the contract's exported pure circuit
  static derivePublicKey(secret: Uint8Array): Uint8Array {
    return pureCircuits.derive_voter_pubkey(secret);
  }

  constructor(secretKey?: Uint8Array) {
    this.secretKey = secretKey ?? randomBytes(32);
    this.contract = new Contract<DaoPrivateState>(daoWitnesses as any);
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

  // Initialize the DAO with admin keys
  public initializeDao(admin0: Uint8Array, admin1: Uint8Array, admin2: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.initialize_dao(
      this.circuitContext,
      admin0,
      admin1,
      admin2
    ).context;
    return this.getLedger();
  }

  // Add an eligible voter (requires admin secret for access control)
  public addEligibleVoter(voterPubKey: Uint8Array, adminSecret: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.add_eligible_voter(
      this.circuitContext,
      voterPubKey,
      adminSecret
    ).context;
    return this.getLedger();
  }

  // Update block height (requires admin secret for access control)
  public updateBlockHeight(newHeight: bigint, adminSecret: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.update_block_height(
      this.circuitContext,
      newHeight,
      adminSecret
    ).context;
    return this.getLedger();
  }

  // Create a new proposal with time-locked phases
  public createProposal(
    proposalId: bigint, 
    metaHash: Uint8Array,
    commitDuration: bigint,
    revealDuration: bigint
  ): Ledger {
    this.circuitContext = this.contract.impureCircuits.create_proposal(
      this.circuitContext,
      proposalId,
      metaHash,
      commitDuration,
      revealDuration
    ).context;
    return this.getLedger();
  }

  // Commit phase: voter commits their vote (requires voter auth path)
  public voteCommit(proposalId: bigint, voteChoice: VoteChoice, voterAuthPath: MerkleTreePath): Ledger {
    // Update private state with vote choice and voter auth path
    let updatedPrivateState = withVoteChoice(
      this.circuitContext.currentPrivateState,
      voteChoice
    );
    updatedPrivateState = withVoterAuthPath(updatedPrivateState, voterAuthPath);
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

  // Advance proposal state by time (after deadline)
  public advanceProposalByTime(proposalId: bigint): Ledger {
    this.circuitContext = this.contract.impureCircuits.advance_proposal_by_time(
      this.circuitContext,
      proposalId
    ).context;
    return this.getLedger();
  }

  // Advance proposal state with multi-sig (requires 2 different admin secrets)
  public advanceProposalMultisig(proposalId: bigint, adminSecret0: Uint8Array, adminSecret1: Uint8Array): Ledger {
    this.circuitContext = this.contract.impureCircuits.advance_proposal_multisig(
      this.circuitContext,
      proposalId,
      adminSecret0,
      adminSecret1
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

  // Get per-proposal vote tallies
  public getProposalVoteTallies(proposalId: bigint): { yes: bigint; no: bigint; appeal: bigint; total: bigint } {
    const ledgerState = this.getLedger();
    return {
      yes: ledgerState.proposalVotesYes.member(proposalId) ? ledgerState.proposalVotesYes.lookup(proposalId) : 0n,
      no: ledgerState.proposalVotesNo.member(proposalId) ? ledgerState.proposalVotesNo.lookup(proposalId) : 0n,
      appeal: ledgerState.proposalVotesAppeal.member(proposalId) ? ledgerState.proposalVotesAppeal.lookup(proposalId) : 0n,
      total: ledgerState.proposalTotalVotes.member(proposalId) ? ledgerState.proposalTotalVotes.lookup(proposalId) : 0n,
    };
  }

  // Check if quorum reached for a proposal
  public isQuorumReached(proposalId: bigint): boolean {
    const ledgerState = this.getLedger();
    if (!ledgerState.proposalQuorumReached.member(proposalId)) return false;
    return ledgerState.proposalQuorumReached.lookup(proposalId);
  }

  // Get proposal deadlines
  public getProposalDeadlines(proposalId: bigint): { commitDeadline: bigint; revealDeadline: bigint } {
    const ledgerState = this.getLedger();
    return {
      commitDeadline: ledgerState.commitDeadline.member(proposalId) ? ledgerState.commitDeadline.lookup(proposalId) : 0n,
      revealDeadline: ledgerState.revealDeadline.member(proposalId) ? ledgerState.revealDeadline.lookup(proposalId) : 0n,
    };
  }

  // Get current block height
  public getCurrentBlockHeight(): bigint {
    const ledgerState = this.getLedger();
    return ledgerState.currentBlockHeight.member(0n) ? ledgerState.currentBlockHeight.lookup(0n) : 0n;
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

  // Get voter auth path from eligible voters tree
  public getVoterAuthPath(voterPubKey: Uint8Array): MerkleTreePath | undefined {
    const ledgerState = this.getLedger();
    const runtimePath = ledgerState.eligibleVoters.findPathForLeaf(voterPubKey) as any;
    if (!runtimePath) return undefined;
    // Return the native runtime path format directly
    return runtimePath;
  }

  // Get commitment path from vote commitments tree
  public getCommitmentPath(commitment: Uint8Array): MerkleTreePath | undefined {
    const ledgerState = this.getLedger();
    const runtimePath = ledgerState.voteCommitments.findPathForLeaf(commitment) as any;
    if (!runtimePath) return undefined;
    // Return the native runtime path format directly
    return runtimePath;
  }
}

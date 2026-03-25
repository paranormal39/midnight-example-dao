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

import { type WitnessContext } from "@midnight-ntwrk/compact-runtime";

// Vote choice enum: 0=NO, 1=YES, 2=APPEAL (matches contract)
export enum VoteChoice {
  NO = 0,
  YES = 1,
  APPEAL = 2,
}

// MerkleTree path structure (depth 10)
export type MerkleTreePath = {
  leaf: Uint8Array;
  siblings: Uint8Array[];
  indices: boolean[];
};

// Private state for DAO voting with commit/reveal pattern
export type DaoPrivateState = {
  // Voter's secret key - used to derive nullifiers and commitments
  readonly secretKey: Uint8Array;
  
  // Current vote choice being cast
  readonly voteChoice: VoteChoice;
  
  // Stored commitments for reveal phase (proposalId -> commitment)
  readonly commitments: Map<bigint, Uint8Array>;
  
  // MerkleTree paths for commitments (commitment hex -> path)
  readonly commitmentPaths: Map<string, MerkleTreePath>;
};

// Witness function type definitions matching the contract
export type DaoWitnesses = {
  get_secret_key: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, Uint8Array];
  get_vote_choice: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, bigint];
  get_commitment_path: (
    context: WitnessContext<DaoPrivateState>,
    proposalId: bigint,
    commitment: Uint8Array
  ) => [DaoPrivateState, MerkleTreePath];
};

// Witness implementations
export const daoWitnesses: DaoWitnesses = {
  // Returns the voter's secret key from private state
  get_secret_key: ({ privateState }): [DaoPrivateState, Uint8Array] => {
    return [privateState, privateState.secretKey];
  },

  // Returns the current vote choice from private state
  get_vote_choice: ({ privateState }): [DaoPrivateState, bigint] => {
    return [privateState, BigInt(privateState.voteChoice)];
  },

  // Returns the MerkleTree path for a commitment
  get_commitment_path: (
    { privateState },
    _proposalId: bigint,
    commitment: Uint8Array
  ): [DaoPrivateState, MerkleTreePath] => {
    const commitmentHex = Buffer.from(commitment).toString('hex');
    const path = privateState.commitmentPaths.get(commitmentHex);
    
    if (!path) {
      throw new Error(`No MerkleTree path found for commitment ${commitmentHex}`);
    }
    
    return [privateState, path];
  },
};

// Helper function to create initial private state
export function createDaoPrivateState(secretKey: Uint8Array): DaoPrivateState {
  if (secretKey.length !== 32) {
    throw new Error("Secret key must be 32 bytes");
  }
  return {
    secretKey,
    voteChoice: VoteChoice.YES,
    commitments: new Map(),
    commitmentPaths: new Map(),
  };
}

// Helper function to update vote choice in private state
export function withVoteChoice(
  state: DaoPrivateState,
  choice: VoteChoice
): DaoPrivateState {
  return {
    ...state,
    voteChoice: choice,
  };
}

// Helper function to store a commitment after vote_commit
export function withCommitment(
  state: DaoPrivateState,
  proposalId: bigint,
  commitment: Uint8Array
): DaoPrivateState {
  const newCommitments = new Map(state.commitments);
  newCommitments.set(proposalId, commitment);
  return {
    ...state,
    commitments: newCommitments,
  };
}

// Helper function to store a MerkleTree path for reveal phase
export function withCommitmentPath(
  state: DaoPrivateState,
  commitment: Uint8Array,
  path: MerkleTreePath
): DaoPrivateState {
  const commitmentHex = Buffer.from(commitment).toString('hex');
  const newPaths = new Map(state.commitmentPaths);
  newPaths.set(commitmentHex, path);
  return {
    ...state,
    commitmentPaths: newPaths,
  };
}

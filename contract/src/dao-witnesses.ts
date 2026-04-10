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

// MerkleTree path structure - uses the native runtime format expected by the contract
// The contract expects: MerkleTreePath<leaf: Bytes<32>, path: Vector<10, MerkleTreePathEntry<sibling: MerkleTreeDigest<field: Field>, goes_left: Boolean>>>
export type MerkleTreePathEntry = {
  sibling: { field: bigint };
  goes_left: boolean; // true = left, false = right
};

export type MerkleTreePath = {
  leaf: Uint8Array;
  path: MerkleTreePathEntry[];
};

// Private state for DAO voting with commit/reveal pattern
export type DaoPrivateState = {
  // Voter's secret key - used to derive nullifiers and commitments
  readonly secretKey: Uint8Array;
  
  // Voter's public key (derived from secret key)
  readonly voterPubKey: Uint8Array;
  
  // Current vote choice being cast
  readonly voteChoice: VoteChoice;
  
  // Stored commitments for reveal phase (proposalId -> commitment)
  readonly commitments: Map<bigint, Uint8Array>;
  
  // MerkleTree paths for commitments (commitment hex -> path)
  readonly commitmentPaths: Map<string, MerkleTreePath>;
  
  // MerkleTree path for voter authorization
  readonly voterAuthPath: MerkleTreePath | null;
};

// Maybe type for optional values (matches Compact's Maybe<T>)
export type Maybe<T> = {
  is_some: boolean;
  value: T;
};

// Witness function type definitions matching the contract
export type DaoWitnesses = {
  get_secret_key: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, Uint8Array];
  get_vote_choice: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, bigint];
  get_commitment_path: (
    context: WitnessContext<DaoPrivateState>,
    commitment: Uint8Array
  ) => [DaoPrivateState, Maybe<MerkleTreePath>];
  get_voter_auth_path: (
    context: WitnessContext<DaoPrivateState>,
    voterPubKey: Uint8Array
  ) => [DaoPrivateState, Maybe<MerkleTreePath>];
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

  // Returns the MerkleTree path for a commitment (Maybe type)
  get_commitment_path: (
    { privateState },
    commitment: Uint8Array
  ): [DaoPrivateState, Maybe<MerkleTreePath>] => {
    const commitmentHex = Buffer.from(commitment).toString('hex');
    const path = privateState.commitmentPaths.get(commitmentHex);
    
    console.log('[WITNESS] get_commitment_path called');
    console.log('[WITNESS] commitment:', commitmentHex.slice(0, 32) + '...');
    console.log('[WITNESS] has stored path:', !!path);
    if (path) {
      console.log('[WITNESS] path depth:', path.path.length);
      console.log('[WITNESS] path leaf:', Buffer.from(path.leaf).toString('hex').slice(0, 32) + '...');
    }
    
    if (!path) {
      // Return none with dummy path structure (10 entries for depth 10)
      const dummyPath = createDummyPath();
      return [privateState, { is_some: false, value: dummyPath }];
    }
    
    return [privateState, { is_some: true, value: path }];
  },

  // Returns the MerkleTree path for voter authorization (Maybe type)
  get_voter_auth_path: (
    { privateState },
    voterPubKey: Uint8Array
  ): [DaoPrivateState, Maybe<MerkleTreePath>] => {
    console.log('[WITNESS] get_voter_auth_path called');
    console.log('[WITNESS] voterPubKey from circuit:', Buffer.from(voterPubKey).toString('hex').slice(0, 32) + '...');
    console.log('[WITNESS] has stored path:', !!privateState.voterAuthPath);
    if (privateState.voterAuthPath) {
      console.log('[WITNESS] stored path leaf:', Buffer.from(privateState.voterAuthPath.leaf).toString('hex').slice(0, 32) + '...');
      // Check if they match
      const pubKeyHex = Buffer.from(voterPubKey).toString('hex');
      const leafHex = Buffer.from(privateState.voterAuthPath.leaf).toString('hex');
      console.log('[WITNESS] pubKey matches leaf:', pubKeyHex === leafHex);
    }
    if (!privateState.voterAuthPath) {
      // Return none with dummy path structure (10 entries for depth 10)
      const dummyPath = createDummyPath();
      return [privateState, { is_some: false, value: dummyPath }];
    }
    return [privateState, { is_some: true, value: privateState.voterAuthPath }];
  },
};

// Helper to create a dummy path structure with correct depth
function createDummyPath(): MerkleTreePath {
  const path = [];
  for (let i = 0; i < 10; i++) {
    path.push({ sibling: { field: 0n }, goes_left: false });
  }
  return { leaf: new Uint8Array(32), path };
}

// Helper function to create initial private state
export function createDaoPrivateState(secretKey: Uint8Array, voterPubKey?: Uint8Array): DaoPrivateState {
  if (secretKey.length !== 32) {
    throw new Error("Secret key must be 32 bytes");
  }
  return {
    secretKey,
    voterPubKey: voterPubKey || new Uint8Array(32),
    voteChoice: VoteChoice.YES,
    commitments: new Map(),
    commitmentPaths: new Map(),
    voterAuthPath: null,
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

// Helper function to set voter authorization path
export function withVoterAuthPath(
  state: DaoPrivateState,
  path: MerkleTreePath
): DaoPrivateState {
  return {
    ...state,
    voterAuthPath: path,
  };
}

// Helper function to set voter public key
export function withVoterPubKey(
  state: DaoPrivateState,
  pubKey: Uint8Array
): DaoPrivateState {
  return {
    ...state,
    voterPubKey: pubKey,
  };
}

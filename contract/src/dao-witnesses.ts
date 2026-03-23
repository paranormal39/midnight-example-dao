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

// Vote choice enum
export enum VoteChoice {
  YES = 0,
  NO = 1,
  APPEAL = 2,
}

// Private state for DAO voting
// Contains the voter's secret key and current vote choice
export type DaoPrivateState = {
  // Voter's secret key - used to derive nullifiers for double-vote prevention
  // This should be derived from the wallet seed or generated randomly
  readonly voterSecret: Uint8Array;
  
  // Current vote choice being cast (set before calling cast_vote)
  readonly currentVoteChoice: VoteChoice;
};

// Witness function type definitions
export type DaoWitnesses = {
  get_voter_secret: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, Uint8Array];
  get_vote_choice: (context: WitnessContext<DaoPrivateState>) => [DaoPrivateState, bigint];
};

// Witness implementations
// These provide private data to the ZK circuits without revealing it on-chain
export const daoWitnesses: DaoWitnesses = {
  // Returns the voter's secret key from private state
  // This is used to derive nullifiers that prevent double voting
  get_voter_secret: ({ privateState }): [DaoPrivateState, Uint8Array] => {
    return [privateState, privateState.voterSecret];
  },

  // Returns the current vote choice from private state
  // This is kept private - only the commitment is revealed on-chain
  get_vote_choice: ({ privateState }): [DaoPrivateState, bigint] => {
    return [privateState, BigInt(privateState.currentVoteChoice)];
  },
};

// Helper function to create initial private state
export function createDaoPrivateState(voterSecret: Uint8Array): DaoPrivateState {
  if (voterSecret.length !== 32) {
    throw new Error("Voter secret must be 32 bytes");
  }
  return {
    voterSecret,
    currentVoteChoice: VoteChoice.YES, // Default, will be updated before voting
  };
}

// Helper function to update vote choice in private state
export function withVoteChoice(
  state: DaoPrivateState,
  choice: VoteChoice
): DaoPrivateState {
  return {
    ...state,
    currentVoteChoice: choice,
  };
}

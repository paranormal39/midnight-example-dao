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

import { Dao, type DaoPrivateState, VoteChoice } from '@midnight-ntwrk/counter-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

export type DaoCircuits = ImpureCircuitId<Dao.Contract<DaoPrivateState>>;

export const DaoPrivateStateId = 'daoPrivateState';

export type DaoProviders = MidnightProviders<DaoCircuits, typeof DaoPrivateStateId, DaoPrivateState>;

export type DaoContract = Dao.Contract<DaoPrivateState>;

export type DeployedDaoContract = DeployedContract<DaoContract> | FoundContract<DaoContract>;

export interface ProposalMetadata {
  policyType: string;
  policyTitle: string;
  policyDescription: string;
  contractAddress: string;
  proposalId?: bigint;
  adminSecret?: string; // Hex-encoded admin secret for phase advancement
}

// Re-export VoteChoice for convenience
export { VoteChoice };

// Proposal status enum
export enum ProposalStatus {
  ACTIVE = 0,
  CLOSED = 1,
}

// Vote commitment data - used for private voting
export interface VoteCommitmentData {
  commitment: Uint8Array;    // hash(voteChoice || voterSecret)
  nullifier: Uint8Array;     // hash(voterSecret || proposalId)
  encryptedVote: Uint8Array; // Encrypted vote for later tallying
}

// Extended ledger state with privacy features
export interface DaoLedgerStateExtended {
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  proposalStatus: Map<bigint, ProposalStatus>;
  voteCommitments: Map<bigint, Set<Uint8Array>>;
  voteNullifiers: Map<bigint, Set<Uint8Array>>;
  votesYes: Map<bigint, bigint>;
  votesNo: Map<bigint, bigint>;
  votesAppeal: Map<bigint, bigint>;
  encryptedVotes: Map<bigint, Set<Uint8Array>>;
}

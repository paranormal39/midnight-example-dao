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

import fs from 'node:fs';
import path from 'node:path';
import { currentDir } from './config.js';
import { type ProposalMetadata } from './dao-types.js';

const PROPOSALS_FILE = path.resolve(currentDir, '..', 'dao-proposals.json');

export interface StoredProposals {
  proposals: ProposalMetadata[];
}

// Serializable version of ProposalMetadata (bigint -> string)
interface SerializedProposal {
  policyType: string;
  policyTitle: string;
  policyDescription: string;
  contractAddress: string;
  proposalId?: string;
}

const serializeProposal = (p: ProposalMetadata): SerializedProposal => ({
  ...p,
  proposalId: p.proposalId !== undefined ? p.proposalId.toString() : undefined,
});

const deserializeProposal = (p: SerializedProposal): ProposalMetadata => ({
  ...p,
  proposalId: p.proposalId !== undefined ? BigInt(p.proposalId) : undefined,
});

export const loadProposals = (): ProposalMetadata[] => {
  try {
    if (fs.existsSync(PROPOSALS_FILE)) {
      const data = fs.readFileSync(PROPOSALS_FILE, 'utf-8');
      const stored: { proposals: SerializedProposal[] } = JSON.parse(data);
      return (stored.proposals || []).map(deserializeProposal);
    }
  } catch {
    // If file is corrupted, start fresh
  }
  return [];
};

export const saveProposal = (proposal: ProposalMetadata): void => {
  try {
    const proposals = loadProposals();
    // Check if proposal already exists (by contract address and proposalId)
    const existingIndex = proposals.findIndex(
      p => p.contractAddress === proposal.contractAddress && p.proposalId === proposal.proposalId
    );
    if (existingIndex >= 0) {
      proposals[existingIndex] = proposal;
    } else {
      proposals.push(proposal);
    }
    const serialized = proposals.map(serializeProposal);
    fs.writeFileSync(PROPOSALS_FILE, JSON.stringify({ proposals: serialized }, null, 2));
    console.log(`  [Storage] Saved to: ${PROPOSALS_FILE}`);
  } catch (err) {
    console.error(`  [Storage] Failed to save: ${err}`);
  }
};

export const getProposalByAddress = (contractAddress: string): ProposalMetadata | undefined => {
  const proposals = loadProposals();
  return proposals.find(p => p.contractAddress === contractAddress);
};

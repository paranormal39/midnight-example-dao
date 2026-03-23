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

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import { Dao, type DaoPrivateState, daoWitnesses, VoteChoice, createDaoPrivateState, withVoteChoice } from '@midnight-ntwrk/counter-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import { type Logger } from 'pino';
import { type DaoCircuits, type DaoProviders, type DeployedDaoContract, DaoPrivateStateId, ProposalStatus, type VoteCommitmentData } from './dao-types';
import { type Config, daoContractConfig } from './config';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type WalletContext, createWalletAndMidnightProvider } from './api';
import { createHash, randomBytes } from 'crypto';

type DaoContractType = Dao.Contract<DaoPrivateState>;

let logger: Logger;

const daoCompiledContract = CompiledContract.make('dao', Dao.Contract).pipe(
  CompiledContract.withWitnesses(daoWitnesses),
  CompiledContract.withCompiledFileAssets(daoContractConfig.zkConfigPath),
);

export interface DaoLedgerState {
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  proposalStatus: Map<bigint, ProposalStatus>;
  voteCount: Map<bigint, bigint>;
  usedNullifiers: Map<string, bigint>;  // nullifier hex -> 1 if used
  votesYes: Map<bigint, bigint>;
  votesNo: Map<bigint, bigint>;
  votesAppeal: Map<bigint, bigint>;
}

export interface ProposalVotes {
  yes: bigint;
  no: bigint;
  appeal: bigint;
}

// Re-export for convenience
export { VoteChoice, createDaoPrivateState, withVoteChoice };

// ═══════════════════════════════════════════════════════════════════════════
// CRYPTOGRAPHIC HELPERS
// ═══════════════════════════════════════════════════════════════════════════

// Generate a voter secret (should be derived from wallet seed in production)
export function generateVoterSecret(): Uint8Array {
  return randomBytes(32);
}

// Compute nullifier: hash(voterSecret || proposalId)
// This prevents double voting while preserving anonymity
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

// Check if a voter has already voted on a proposal
export async function hasVoted(
  providers: DaoProviders,
  contractAddress: ContractAddress,
  voterSecret: Uint8Array,
  proposalId: bigint,
): Promise<boolean> {
  const state = await getDaoLedgerState(providers, contractAddress);
  if (!state) return false;
  
  const nullifier = computeNullifier(voterSecret, proposalId);
  const nullifierHex = Buffer.from(nullifier).toString('hex');
  
  // Check if nullifier is marked as used
  return state.usedNullifiers.get(nullifierHex) === 1n;
}

// ═══════════════════════════════════════════════════════════════════════════
// LEDGER STATE QUERIES
// ═══════════════════════════════════════════════════════════════════════════

export const getDaoLedgerState = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
): Promise<DaoLedgerState | null> => {
  assertIsContractAddress(contractAddress);
  logger.info('Checking DAO contract ledger state...');
  const state = await providers.publicDataProvider
    .queryContractState(contractAddress)
    .then((contractState) => {
      if (contractState == null) return null;
      const ledgerState = Dao.ledger(contractState.data);
      
      // Convert iterables to Maps
      const proposalMeta = new Map<bigint, Uint8Array>();
      for (const [k, v] of ledgerState.proposalMeta) {
        proposalMeta.set(k, v);
      }
      
      const proposalStatus = new Map<bigint, ProposalStatus>();
      for (const [k, v] of ledgerState.proposalStatus) {
        proposalStatus.set(k, Number(v) as ProposalStatus);
      }
      
      const voteCount = new Map<bigint, bigint>();
      for (const [k, v] of ledgerState.voteCount) {
        voteCount.set(k, v);
      }
      
      const usedNullifiers = new Map<string, bigint>();
      for (const [k, v] of ledgerState.usedNullifiers) {
        // Convert Uint8Array key to hex string
        usedNullifiers.set(Buffer.from(k).toString('hex'), v);
      }
      
      const votesYes = new Map<bigint, bigint>();
      for (const [k, v] of ledgerState.votesYes) {
        votesYes.set(k, v);
      }
      const votesNo = new Map<bigint, bigint>();
      for (const [k, v] of ledgerState.votesNo) {
        votesNo.set(k, v);
      }
      const votesAppeal = new Map<bigint, bigint>();
      for (const [k, v] of ledgerState.votesAppeal) {
        votesAppeal.set(k, v);
      }
      
      return {
        proposalCount: ledgerState.proposalCount,
        proposalMeta,
        proposalStatus,
        voteCount,
        usedNullifiers,
        votesYes,
        votesNo,
        votesAppeal,
      };
    });
  if (state) {
    logger.info(`Ledger state: ${state.proposalCount} proposals`);
  }
  return state;
};

export const getProposalVotes = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  proposalId: bigint,
): Promise<ProposalVotes | null> => {
  const state = await getDaoLedgerState(providers, contractAddress);
  if (!state) return null;
  
  return {
    yes: state.votesYes.get(proposalId) ?? 0n,
    no: state.votesNo.get(proposalId) ?? 0n,
    appeal: state.votesAppeal.get(proposalId) ?? 0n,
  };
};

// ═══════════════════════════════════════════════════════════════════════════
// CONTRACT DEPLOYMENT AND JOINING
// ═══════════════════════════════════════════════════════════════════════════

export const joinDaoContract = async (
  providers: DaoProviders,
  contractAddress: string,
  voterSecret: Uint8Array,
): Promise<DeployedDaoContract> => {
  const initialPrivateState = createDaoPrivateState(voterSecret);
  const daoContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: daoCompiledContract,
    privateStateId: 'daoPrivateState',
    initialPrivateState,
  });
  logger.info(`Joined DAO contract at address: ${daoContract.deployTxData.public.contractAddress}`);
  return daoContract;
};

export const deployDaoContract = async (
  providers: DaoProviders,
  voterSecret: Uint8Array,
): Promise<DeployedDaoContract> => {
  logger.info('Deploying DAO contract...');
  const initialPrivateState = createDaoPrivateState(voterSecret);
  const daoContract = await deployContract(providers, {
    compiledContract: daoCompiledContract,
    privateStateId: 'daoPrivateState',
    initialPrivateState,
  });
  logger.info(`Deployed DAO contract at address: ${daoContract.deployTxData.public.contractAddress}`);
  return daoContract;
};

// ═══════════════════════════════════════════════════════════════════════════
// PROPOSAL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

export const createProposal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  metaHash: Uint8Array,
): Promise<FinalizedTxData> => {
  logger.info(`Creating proposal ${proposalId} on-chain...`);
  const finalizedTxData = await daoContract.callTx.create_proposal(proposalId, metaHash);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Close a proposal and reveal final tallies
export const closeProposal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  finalYes: bigint,
  finalNo: bigint,
  finalAppeal: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Closing proposal ${proposalId} with tallies: YES=${finalYes}, NO=${finalNo}, APPEAL=${finalAppeal}...`);
  const finalizedTxData = await daoContract.callTx.close_proposal(proposalId, finalYes, finalNo, finalAppeal);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// ═══════════════════════════════════════════════════════════════════════════
// PRIVATE VOTING
// ═══════════════════════════════════════════════════════════════════════════

// Cast a private vote on a proposal
// This is the main voting function that uses ZK proofs to hide the vote
export const castVote = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
  voteChoice: VoteChoice,
  voterSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  
  // Check if already voted
  const alreadyVoted = await hasVoted(providers, contractAddress, voterSecret, proposalId);
  if (alreadyVoted) {
    throw new Error(`You have already voted on proposal ${proposalId}`);
  }
  
  // Get current vote count for this proposal
  const state = await getDaoLedgerState(providers, contractAddress);
  const currentVoteCount = state?.voteCount.get(proposalId) ?? 0n;
  
  // Compute nullifier
  const nullifier = computeNullifier(voterSecret, proposalId);
  
  logger.info(`Casting private vote on proposal ${proposalId}...`);
  logger.info(`Nullifier: ${Buffer.from(nullifier).toString('hex').slice(0, 16)}...`);
  logger.info(`Current vote count: ${currentVoteCount}`);
  
  // Call the cast_vote circuit with new signature: (proposalId, nullifier, currentVoteCount)
  const finalizedTxData = await daoContract.callTx.cast_vote(
    proposalId,
    nullifier,
    currentVoteCount,
  );
  
  logger.info(`Vote cast successfully! Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Convenience functions that wrap castVote with specific vote choices
export const voteYes = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
  voterSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  return castVote(daoContract, providers, proposalId, VoteChoice.YES, voterSecret);
};

export const voteNo = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
  voterSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  return castVote(daoContract, providers, proposalId, VoteChoice.NO, voterSecret);
};

export const voteAppeal = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
  voterSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  return castVote(daoContract, providers, proposalId, VoteChoice.APPEAL, voterSecret);
};

export const displayVoteResults = async (
  providers: DaoProviders,
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<ProposalVotes | null> => {
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  const votes = await getProposalVotes(providers, contractAddress, proposalId);
  if (votes === null) {
    logger.info(`No votes found for proposal ${proposalId}.`);
  } else {
    logger.info(`Vote Results for Proposal ${proposalId} - Yes: ${votes.yes}, No: ${votes.no}, Appeal: ${votes.appeal}`);
  }
  return votes;
};


export const configureDaoProviders = async (ctx: WalletContext, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<DaoCircuits>(daoContractConfig.zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider<typeof DaoPrivateStateId>({
      privateStateStoreName: daoContractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

export function setDaoLogger(_logger: Logger) {
  logger = _logger;
}

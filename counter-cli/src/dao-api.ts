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
import { Dao, type DaoPrivateState, daoWitnesses, VoteChoice, createDaoPrivateState, withVoteChoice, withCommitmentPath, type MerkleTreePath } from '@midnight-ntwrk/counter-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import { type Logger } from 'pino';
import { type DaoCircuits, type DaoProviders, type DeployedDaoContract, DaoPrivateStateId } from './dao-types.js';
import { type Config, daoContractConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type WalletContext, createWalletAndMidnightProvider } from './api.js';
import { randomBytes } from 'crypto';

type DaoContractType = Dao.Contract<DaoPrivateState>;

let logger: Logger;

const daoCompiledContract = CompiledContract.make('dao', Dao.Contract).pipe(
  CompiledContract.withWitnesses(daoWitnesses),
  CompiledContract.withCompiledFileAssets(daoContractConfig.zkConfigPath),
);

// Proposal state enum (matches contract)
export enum ProposalState {
  SETUP = 0,
  COMMIT = 1,
  REVEAL = 2,
  FINAL = 3,
}

export interface DaoLedgerState {
  round: bigint;
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  proposalState: Map<bigint, ProposalState>;
  votesYes: bigint;
  votesNo: bigint;
  votesAppeal: bigint;
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
      
      const proposalState = new Map<bigint, ProposalState>();
      for (const [k, v] of ledgerState.proposalState) {
        proposalState.set(k, v as ProposalState);
      }
      
      return {
        round: ledgerState.round,
        proposalCount: ledgerState.proposalCount,
        proposalMeta,
        proposalState,
        votesYes: ledgerState.votesYes,
        votesNo: ledgerState.votesNo,
        votesAppeal: ledgerState.votesAppeal,
      };
    });
  if (state) {
    logger.info(`Ledger state: ${state.proposalCount} proposals, round ${state.round}`);
  }
  return state;
};

export const getProposalVotes = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
): Promise<ProposalVotes | null> => {
  const state = await getDaoLedgerState(providers, contractAddress);
  if (!state) return null;
  
  return {
    yes: state.votesYes,
    no: state.votesNo,
    appeal: state.votesAppeal,
  };
};

export const getProposalState = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  proposalId: bigint,
): Promise<ProposalState | null> => {
  const state = await getDaoLedgerState(providers, contractAddress);
  if (!state) return null;
  return state.proposalState.get(proposalId) ?? null;
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
  logger.info(`Creating proposal ${proposalId} on-chain (starts in COMMIT phase)...`);
  const finalizedTxData = await daoContract.callTx.create_proposal(proposalId, metaHash);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Advance proposal state: COMMIT -> REVEAL -> FINAL
export const advanceProposal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Advancing proposal ${proposalId} to next phase...`);
  const finalizedTxData = await daoContract.callTx.advance_proposal(proposalId);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMIT/REVEAL VOTING
// ═══════════════════════════════════════════════════════════════════════════

// Commit phase: Submit a vote commitment (vote stays hidden)
// The nullifier and commitment are derived INSIDE the circuit using persistentCommit
export const voteCommit = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Committing vote on proposal ${proposalId}...`);
  logger.info(`Vote choice and nullifier are derived inside the ZK circuit`);
  
  const finalizedTxData = await daoContract.callTx.vote_commit(proposalId);
  
  logger.info(`Vote committed! Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Reveal phase: Reveal vote and increment tally
// The tally is incremented INSIDE the circuit (cryptographically enforced)
export const voteReveal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Revealing vote on proposal ${proposalId}...`);
  logger.info(`Tally will be incremented inside the ZK circuit`);
  
  const finalizedTxData = await daoContract.callTx.vote_reveal(proposalId);
  
  logger.info(`Vote revealed! Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Convenience functions for commit phase with specific vote choices
export const voteYes = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  // Vote choice is set in private state before calling
  return voteCommit(daoContract, proposalId);
};

export const voteNo = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  return voteCommit(daoContract, proposalId);
};

export const voteAppeal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  return voteCommit(daoContract, proposalId);
};

export const displayVoteResults = async (
  providers: DaoProviders,
  daoContract: DeployedDaoContract,
): Promise<ProposalVotes | null> => {
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  const votes = await getProposalVotes(providers, contractAddress);
  if (votes === null) {
    logger.info(`No vote tallies found.`);
  } else {
    logger.info(`Vote Results - Yes: ${votes.yes}, No: ${votes.no}, Appeal: ${votes.appeal}`);
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

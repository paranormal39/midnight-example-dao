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
import { Dao, type DaoPrivateState, daoWitnesses } from '@midnight-ntwrk/counter-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type FinalizedTxData } from '@midnight-ntwrk/midnight-js-types';
import { type Logger } from 'pino';
import { type DaoCircuits, type DaoProviders, type DeployedDaoContract, DaoPrivateStateId } from './dao-types';
import { type Config, daoContractConfig } from './config';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js-utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type WalletContext, createWalletAndMidnightProvider } from './api';

type DaoContractType = Dao.Contract<DaoPrivateState>;

let logger: Logger;

const daoCompiledContract = CompiledContract.make('dao', Dao.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(daoContractConfig.zkConfigPath),
);

export interface DaoLedgerState {
  proposalCount: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  votesYes: Map<bigint, bigint>;
  votesNo: Map<bigint, bigint>;
  votesAppeal: Map<bigint, bigint>;
}

export interface ProposalVotes {
  yes: bigint;
  no: bigint;
  appeal: bigint;
}

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

export const joinDaoContract = async (
  providers: DaoProviders,
  contractAddress: string,
): Promise<DeployedDaoContract> => {
  const daoContract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: daoCompiledContract,
    privateStateId: 'daoPrivateState',
    initialPrivateState: { dummy: 0 },
  });
  logger.info(`Joined DAO contract at address: ${daoContract.deployTxData.public.contractAddress}`);
  return daoContract;
};

export const deployDaoContract = async (
  providers: DaoProviders,
): Promise<DeployedDaoContract> => {
  logger.info('Deploying DAO contract...');
  const daoContract = await deployContract(providers, {
    compiledContract: daoCompiledContract,
    privateStateId: 'daoPrivateState',
    initialPrivateState: { dummy: 0 },
  });
  logger.info(`Deployed DAO contract at address: ${daoContract.deployTxData.public.contractAddress}`);
  return daoContract;
};

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

export const voteYes = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  currentVotes: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Voting YES on proposal ${proposalId}...`);
  const finalizedTxData = await daoContract.callTx.vote_yes(proposalId, currentVotes);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

export const voteNo = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  currentVotes: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Voting NO on proposal ${proposalId}...`);
  const finalizedTxData = await daoContract.callTx.vote_no(proposalId, currentVotes);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

export const voteAppeal = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  currentVotes: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Voting APPEAL on proposal ${proposalId}...`);
  const finalizedTxData = await daoContract.callTx.vote_appeal(proposalId, currentVotes);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
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

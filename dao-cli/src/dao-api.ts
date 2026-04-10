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
import { Dao, type DaoPrivateState, daoWitnesses, VoteChoice, createDaoPrivateState, withVoteChoice, withCommitment, withCommitmentPath, withVoterAuthPath, type MerkleTreePath } from '@midnight-ntwrk/dao-contract';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js/contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type FinalizedTxData } from '@midnight-ntwrk/midnight-js/types';
import { type Logger } from 'pino';
import { type DaoCircuits, type DaoProviders, type DeployedDaoContract, DaoPrivateStateId } from './dao-types.js';
import { type Config, daoContractConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress } from '@midnight-ntwrk/midnight-js/utils';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { type WalletContext, createWalletAndMidnightProvider } from './api.js';
import { randomBytes } from 'crypto';

type DaoContractType = Dao.Contract<DaoPrivateState>;

let logger: Logger;

// Derive voter public key from secret using the contract's pure circuit
export const deriveVoterPubKey = (voterSecret: Uint8Array): Uint8Array => {
  return Dao.pureCircuits.derive_voter_pubkey(voterSecret);
};

// Compute vote commitment using the contract's pure circuit
// This is used to store the commitment locally for later reveal
export const computeVoteCommitment = (
  voterSecret: Uint8Array,
  voteChoice: VoteChoice,
  proposalId: bigint,
  currentRound: bigint,
): Uint8Array => {
  return Dao.pureCircuits.compute_vote_commitment(
    voterSecret,
    BigInt(voteChoice),
    proposalId,
    currentRound,
  );
};

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
  adminNonce: bigint;
  proposalMeta: Map<bigint, Uint8Array>;
  proposalState: Map<bigint, ProposalState>;
  currentBlockHeight: bigint;
}

export interface ProposalVotes {
  yes: bigint;
  no: bigint;
  appeal: bigint;
  total: bigint;
  quorumReached: boolean;
}

export interface ProposalDeadlines {
  commitDeadline: bigint;
  revealDeadline: bigint;
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
      
      // Get current block height from Map (key 0)
      const currentBlockHeight = ledgerState.currentBlockHeight.member(0n) 
        ? ledgerState.currentBlockHeight.lookup(0n) 
        : 0n;
      
      return {
        round: ledgerState.round,
        proposalCount: ledgerState.proposalCount,
        adminNonce: ledgerState.adminNonce,
        proposalMeta,
        proposalState,
        currentBlockHeight,
      };
    });
  if (state) {
    logger.info(`Ledger state: ${state.proposalCount} proposals, round ${state.round}, block ${state.currentBlockHeight}`);
  }
  return state;
};

export const getProposalVotes = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  proposalId: bigint,
): Promise<ProposalVotes | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  
  const ledgerState = Dao.ledger(contractState.data);
  
  return {
    yes: ledgerState.proposalVotesYes.member(proposalId) ? ledgerState.proposalVotesYes.lookup(proposalId) : 0n,
    no: ledgerState.proposalVotesNo.member(proposalId) ? ledgerState.proposalVotesNo.lookup(proposalId) : 0n,
    appeal: ledgerState.proposalVotesAppeal.member(proposalId) ? ledgerState.proposalVotesAppeal.lookup(proposalId) : 0n,
    total: ledgerState.proposalTotalVotes.member(proposalId) ? ledgerState.proposalTotalVotes.lookup(proposalId) : 0n,
    quorumReached: ledgerState.proposalQuorumReached.member(proposalId) ? ledgerState.proposalQuorumReached.lookup(proposalId) : false,
  };
};

export const getProposalDeadlines = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  proposalId: bigint,
): Promise<ProposalDeadlines | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  
  const ledgerState = Dao.ledger(contractState.data);
  
  return {
    commitDeadline: ledgerState.commitDeadline.member(proposalId) ? ledgerState.commitDeadline.lookup(proposalId) : 0n,
    revealDeadline: ledgerState.revealDeadline.member(proposalId) ? ledgerState.revealDeadline.lookup(proposalId) : 0n,
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

// Construct a Merkle tree path for a leaf at position 0 in a depth-10 tree
// This is used when we know the voter was just added and is the first/only leaf
const constructMerklePathForFirstLeaf = (leaf: Uint8Array, depth: number = 10): MerkleTreePath => {
  // For a leaf at position 0, all siblings are empty (zero field) and all directions are right (goes_left=false)
  const path = [];
  for (let i = 0; i < depth; i++) {
    path.push({
      sibling: { field: 0n },
      goes_left: false, // false = goes right (leaf is on left side at position 0)
    });
  }
  return { leaf, path };
};

// Get voter authorization path from the on-chain eligible voters Merkle tree
export const getVoterAuthPath = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  voterPubKey: Uint8Array,
): Promise<MerkleTreePath | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  
  const ledgerState = Dao.ledger(contractState.data);
  
  // Try to get the path from the tree
  try {
    const runtimePath = ledgerState.eligibleVoters.findPathForLeaf(voterPubKey) as any;
    if (runtimePath) {
      logger.info('Got runtime path from findPathForLeaf');
      // Log the first path entry to see its structure
      if (runtimePath.path && runtimePath.path.length > 0) {
        const firstEntry = runtimePath.path[0];
        logger.info(`First path entry keys: ${Object.keys(firstEntry).join(', ')}`);
        logger.info(`First path entry: ${JSON.stringify(firstEntry, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
      }
      // The runtime returns 'dir' but contract expects 'goes_left' - transform if needed
      if (runtimePath.path && runtimePath.path[0] && 'dir' in runtimePath.path[0]) {
        logger.info('Transforming path from dir to goes_left format');
        const transformedPath = {
          leaf: runtimePath.leaf,
          path: runtimePath.path.map((entry: any) => ({
            sibling: entry.sibling,
            goes_left: entry.dir === 1, // dir=1 means goes_left=true
          })),
        };
        return transformedPath;
      }
      return runtimePath;
    }
  } catch (e) {
    // If findPathForLeaf fails (e.g., tree not rehashed), construct path manually
    logger.info(`findPathForLeaf failed: ${e}`);
  }
  
  // Fallback: construct path for first leaf position
  logger.info('Using constructed Merkle path for first leaf position');
  const path = constructMerklePathForFirstLeaf(voterPubKey, 10);
  logger.info(`Constructed path structure: ${JSON.stringify(path, (k, v) => typeof v === 'bigint' ? v.toString() : v, 2).slice(0, 500)}`);
  return path;
};

// Update the contract's private state with the voter auth path
export const updatePrivateStateWithVoterAuth = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  voterPubKey: Uint8Array,
): Promise<void> => {
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  const authPath = await getVoterAuthPath(providers, contractAddress, voterPubKey);
  if (!authPath) {
    throw new Error('Voter not found in eligible voters tree');
  }
  
  // Update the private state with the voter auth path
  const currentState = await providers.privateStateProvider.get('daoPrivateState') as DaoPrivateState;
  const updatedState = withVoterAuthPath(currentState, authPath);
  await providers.privateStateProvider.set('daoPrivateState', updatedState);
  logger.info('Updated private state with voter authorization path');
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
  commitDuration: bigint = 100n,
  revealDuration: bigint = 100n,
): Promise<FinalizedTxData> => {
  logger.info(`Creating proposal ${proposalId} on-chain (starts in COMMIT phase)...`);
  logger.info(`Commit duration: ${commitDuration} blocks, Reveal duration: ${revealDuration} blocks`);
  const finalizedTxData = await daoContract.callTx.create_proposal(proposalId, metaHash, commitDuration, revealDuration);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Advance proposal state by time (after deadline passes)
export const advanceProposalByTime = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Advancing proposal ${proposalId} by time (deadline passed)...`);
  const finalizedTxData = await daoContract.callTx.advance_proposal_by_time(proposalId);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Advance proposal state with multi-sig (2-of-3 admin secrets required)
export const advanceProposalMultisig = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  adminSecret0: Uint8Array,
  adminSecret1: Uint8Array,
): Promise<FinalizedTxData> => {
  logger.info(`Advancing proposal ${proposalId} with 2-of-3 admin authorization...`);
  const finalizedTxData = await daoContract.callTx.advance_proposal_multisig(proposalId, adminSecret0, adminSecret1);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Initialize DAO with admin keys
export const initializeDao = async (
  daoContract: DeployedDaoContract,
  admin0: Uint8Array,
  admin1: Uint8Array,
  admin2: Uint8Array,
): Promise<FinalizedTxData> => {
  logger.info(`Initializing DAO with admin keys...`);
  const finalizedTxData = await daoContract.callTx.initialize_dao(admin0, admin1, admin2);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Add eligible voter (requires admin secret for access control)
export const addEligibleVoter = async (
  daoContract: DeployedDaoContract,
  voterPubKey: Uint8Array,
  adminSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  logger.info(`Adding eligible voter...`);
  const finalizedTxData = await daoContract.callTx.add_eligible_voter(voterPubKey, adminSecret);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Update block height (requires admin secret for access control)
export const updateBlockHeight = async (
  daoContract: DeployedDaoContract,
  newHeight: bigint,
  adminSecret: Uint8Array,
): Promise<FinalizedTxData> => {
  logger.info(`Updating block height to ${newHeight}...`);
  const finalizedTxData = await daoContract.callTx.update_block_height(newHeight, adminSecret);
  logger.info(`Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// ═══════════════════════════════════════════════════════════════════════════
// COMMIT/REVEAL VOTING
// ═══════════════════════════════════════════════════════════════════════════

// Commit phase: Submit a vote commitment (vote stays hidden)
// The nullifier and commitment are derived INSIDE the circuit using persistentCommit
// ballot: 0=NO, 1=YES, 2=APPEAL (passed as parameter like micro-dao)
export const voteCommit = async (
  daoContract: DeployedDaoContract,
  proposalId: bigint,
  ballot: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Committing vote on proposal ${proposalId} with ballot ${ballot}...`);
  logger.info(`Vote choice and nullifier are derived inside the ZK circuit`);
  
  const finalizedTxData = await daoContract.callTx.vote_commit(proposalId, ballot);
  
  logger.info(`Vote committed! Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Get commitment path from the on-chain vote commitments Merkle tree
export const getCommitmentPath = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  commitment: Uint8Array,
): Promise<MerkleTreePath | null> => {
  assertIsContractAddress(contractAddress);
  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (!contractState) return null;
  
  const ledgerState = Dao.ledger(contractState.data);
  try {
    const runtimePath = ledgerState.voteCommitments.findPathForLeaf(commitment) as any;
    if (!runtimePath) return null;
    
    // Return the native runtime path format directly - the contract expects this format
    return runtimePath;
  } catch (e) {
    // If findPathForLeaf fails (e.g., tree not rehashed), log and return null
    logger.info(`findPathForLeaf failed for commitment: ${e}`);
    return null;
  }
};

// Reveal phase: Reveal vote and increment tally
// The tally is incremented INSIDE the circuit (cryptographically enforced)
export const voteReveal = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  logger.info(`Revealing vote on proposal ${proposalId}...`);
  
  // Get the commitment from private state and fetch its Merkle path
  const currentState = await providers.privateStateProvider.get('daoPrivateState') as DaoPrivateState;
  const commitment = currentState.commitments.get(proposalId);
  if (!commitment) {
    throw new Error('No commitment found for this proposal - did you commit a vote first?');
  }
  
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  
  // Retry fetching the commitment path with exponential backoff
  // The tree may need time to be rehashed after insertions
  let commitmentPath: MerkleTreePath | null = null;
  let retries = 0;
  const maxRetries = 5;
  
  while (!commitmentPath && retries < maxRetries) {
    commitmentPath = await getCommitmentPath(providers, contractAddress, commitment);
    if (!commitmentPath) {
      retries++;
      if (retries < maxRetries) {
        const waitMs = 1000 * Math.pow(2, retries - 1); // 1s, 2s, 4s, 8s, 16s
        logger.info(`Commitment path not found, retrying in ${waitMs}ms... (attempt ${retries}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }
  }
  
  if (!commitmentPath) {
    throw new Error('Commitment not found in on-chain Merkle tree after retries - tree may not be properly indexed');
  }
  
  // Update private state with commitment path for ZK proof (keyed by commitment, not proposalId)
  const updatedState = withCommitmentPath(currentState, commitment, commitmentPath);
  await providers.privateStateProvider.set('daoPrivateState', updatedState);
  
  logger.info(`Tally will be incremented inside the ZK circuit`);
  const finalizedTxData = await daoContract.callTx.vote_reveal(proposalId);
  
  logger.info(`Vote revealed! Transaction ${finalizedTxData.public.txId} added in block ${finalizedTxData.public.blockHeight}`);
  return finalizedTxData.public;
};

// Helper to update private state with vote choice before committing
const updateVoteChoice = async (
  providers: DaoProviders,
  choice: VoteChoice,
): Promise<void> => {
  const currentState = await providers.privateStateProvider.get('daoPrivateState') as DaoPrivateState;
  const updatedState = withVoteChoice(currentState, choice);
  await providers.privateStateProvider.set('daoPrivateState', updatedState);
};

// Helper to store commitment after successful vote_commit
const storeCommitmentAfterCommit = async (
  providers: DaoProviders,
  contractAddress: ContractAddress,
  proposalId: bigint,
  voteChoice: VoteChoice,
): Promise<void> => {
  // Get current round from ledger state
  const state = await getDaoLedgerState(providers, contractAddress);
  const currentRound = state?.round ?? 0n;
  
  // Get voter secret from private state and compute commitment
  const currentState = await providers.privateStateProvider.get('daoPrivateState') as DaoPrivateState;
  const commitment = computeVoteCommitment(
    currentState.secretKey,
    voteChoice,
    proposalId,
    currentRound,
  );
  
  // Store commitment in private state for later reveal
  const updatedState = withCommitment(currentState, proposalId, commitment);
  await providers.privateStateProvider.set('daoPrivateState', updatedState);
  logger.info('Stored vote commitment for reveal phase');
};

// Helper to refresh voter auth path before voting (ensures we have latest tree state)
const refreshVoterAuthPath = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
): Promise<void> => {
  const currentState = await providers.privateStateProvider.get('daoPrivateState') as DaoPrivateState;
  const voterPubKey = deriveVoterPubKey(currentState.secretKey);
  await updatePrivateStateWithVoterAuth(daoContract, providers, voterPubKey);
};

// Convenience functions for commit phase with specific vote choices
export const voteYes = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  // Refresh voter auth path to ensure we have latest tree state
  await refreshVoterAuthPath(daoContract, providers);
  // Update private state with vote choice before ZK proof generation
  await updateVoteChoice(providers, VoteChoice.YES);
  const result = await voteCommit(daoContract, proposalId, BigInt(VoteChoice.YES));
  // Store commitment for reveal phase
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  await storeCommitmentAfterCommit(providers, contractAddress, proposalId, VoteChoice.YES);
  return result;
};

export const voteNo = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  await refreshVoterAuthPath(daoContract, providers);
  await updateVoteChoice(providers, VoteChoice.NO);
  const result = await voteCommit(daoContract, proposalId, BigInt(VoteChoice.NO));
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  await storeCommitmentAfterCommit(providers, contractAddress, proposalId, VoteChoice.NO);
  return result;
};

export const voteAppeal = async (
  daoContract: DeployedDaoContract,
  providers: DaoProviders,
  proposalId: bigint,
): Promise<FinalizedTxData> => {
  await refreshVoterAuthPath(daoContract, providers);
  await updateVoteChoice(providers, VoteChoice.APPEAL);
  const result = await voteCommit(daoContract, proposalId, BigInt(VoteChoice.APPEAL));
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  await storeCommitmentAfterCommit(providers, contractAddress, proposalId, VoteChoice.APPEAL);
  return result;
};

export const displayVoteResults = async (
  providers: DaoProviders,
  daoContract: DeployedDaoContract,
  proposalId: bigint,
): Promise<ProposalVotes | null> => {
  const contractAddress = daoContract.deployTxData.public.contractAddress;
  const votes = await getProposalVotes(providers, contractAddress, proposalId);
  if (votes === null) {
    logger.info(`No vote tallies found for proposal ${proposalId}.`);
  } else {
    logger.info(`Vote Results for Proposal ${proposalId}:`);
    logger.info(`  Yes: ${votes.yes}, No: ${votes.no}, Appeal: ${votes.appeal}`);
    logger.info(`  Total: ${votes.total}, Quorum Reached: ${votes.quorumReached}`);
  }
  return votes;
};


export const configureDaoProviders = async (ctx: WalletContext, config: Config) => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<DaoCircuits>(daoContractConfig.zkConfigPath);
  // accountId and privateStoragePasswordProvider are required by levelPrivateStateProvider.
  // The coin public key is encoded as base64 for the password — base64 output covers all
  // four character classes and avoids repeated-character runs found in raw hex strings.
  const accountId = walletAndMidnightProvider.getCoinPublicKey();
  const storagePassword = `${Buffer.from(accountId, 'hex').toString('base64')}!`;
  return {
    privateStateProvider: levelPrivateStateProvider<typeof DaoPrivateStateId>({
      privateStateStoreName: daoContractConfig.privateStateStoreName,
      accountId,
      privateStoragePasswordProvider: () => storagePassword,
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

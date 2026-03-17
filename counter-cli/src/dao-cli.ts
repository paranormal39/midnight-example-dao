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

import { type WalletContext } from './api';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type DaoProviders, type DeployedDaoContract, type ProposalMetadata } from './dao-types';
import { createHash } from 'crypto';
import { type Config, StandaloneConfig } from './config';
import * as api from './api';
import * as daoApi from './dao-api';
import * as storage from './dao-storage';

let logger: Logger;

const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

const BANNER = `
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║              Midnight DAO Voting Example                     ║
║              ───────────────────────────                     ║
║              A privacy-preserving voting contract demo       ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`;

const DIVIDER = '──────────────────────────────────────────────────────────────';

const WALLET_MENU = `
${DIVIDER}
  Wallet Setup
${DIVIDER}
  [1] Create a new wallet
  [2] Restore wallet from seed
  [3] Exit
${'─'.repeat(62)}
> `;

const contractMenu = (dustBalance: string, proposalCount: number) => `
${DIVIDER}
  DAO Main Menu${dustBalance ? `                       DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Create new proposal (deploys a new voting contract)
  [2] Join proposal by address (enter contract address)
  [3] Select saved proposal to vote (${proposalCount} saved)
  [4] Monitor DUST balance
  [5] Exit
${'─'.repeat(62)}
> `;

const votingMenu = (proposal: ProposalMetadata, dustBalance: string) => `
${DIVIDER}
  Proposal: ${proposal.policyTitle}${dustBalance ? `          DUST: ${dustBalance}` : ''}
${DIVIDER}
  Type: ${proposal.policyType}
  Description: ${proposal.policyDescription}
${DIVIDER}
  [1] Vote YES
  [2] Vote NO
  [3] Vote APPEAL
  [4] View Results
  [5] Back to Main Menu
${'─'.repeat(62)}
> `;

const buildWalletFromSeed = async (config: Config, rli: Interface): Promise<WalletContext> => {
  const seed = await rli.question('Enter your wallet seed: ');
  return await api.buildWalletAndWaitForFunds(config, seed);
};

const buildWallet = async (config: Config, rli: Interface): Promise<WalletContext | null> => {
  if (config instanceof StandaloneConfig) {
    return await api.buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED);
  }

  while (true) {
    const choice = await rli.question(WALLET_MENU);
    switch (choice.trim()) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2':
        return await buildWalletFromSeed(config, rli);
      case '3':
        return null;
      default:
        logger.error(`Invalid choice: ${choice}`);
    }
  }
};

const getDustLabel = async (wallet: api.WalletContext['wallet']): Promise<string> => {
  try {
    const dust = await api.getDustBalance(wallet);
    return dust.available.toLocaleString();
  } catch {
    return '';
  }
};

const createProposalMetadata = async (rli: Interface): Promise<ProposalMetadata> => {
  console.log('\n  Create New Proposal\n');
  const policyType = await rli.question('  Policy Type: ');
  const policyTitle = await rli.question('  Policy Title: ');
  const policyDescription = await rli.question('  Description: ');
  return {
    policyType: policyType.trim(),
    policyTitle: policyTitle.trim(),
    policyDescription: policyDescription.trim(),
    contractAddress: '',
    proposalId: 0n,
  };
};

const computeMetaHash = (metadata: ProposalMetadata): Uint8Array => {
  const json = JSON.stringify({
    policyType: metadata.policyType,
    policyTitle: metadata.policyTitle,
    policyDescription: metadata.policyDescription,
  });
  const hash = createHash('sha256').update(json).digest();
  return new Uint8Array(hash);
};

const startDustMonitor = async (wallet: api.WalletContext['wallet'], rli: Interface): Promise<void> => {
  console.log('');
  const stopPromise = rli.question('  Press Enter to return to menu...\n').then(() => {});
  await api.monitorDustBalance(wallet, stopPromise);
  console.log('');
};

const listProposals = (proposals: ProposalMetadata[]): void => {
  if (proposals.length === 0) {
    console.log('\n  No saved proposals found.\n');
    return;
  }
  console.log(`\n${DIVIDER}`);
  console.log('  Saved Proposals');
  console.log(DIVIDER);
  proposals.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.policyTitle}`);
    console.log(`      Type: ${p.policyType}`);
    console.log(`      Address: ${p.contractAddress.substring(0, 16)}...`);
    console.log('');
  });
  console.log(DIVIDER);
};

const selectProposal = async (
  proposals: ProposalMetadata[],
  providers: DaoProviders,
  rli: Interface,
): Promise<{ contract: DeployedDaoContract; metadata: ProposalMetadata } | null> => {
  if (proposals.length === 0) {
    console.log('\n  No saved proposals. Create or join one first.\n');
    return null;
  }
  
  listProposals(proposals);
  const choice = await rli.question('  Select proposal number to vote (or 0 to cancel): ');
  const index = parseInt(choice.trim(), 10) - 1;
  
  if (isNaN(index) || index < 0 || index >= proposals.length) {
    if (choice.trim() !== '0') {
      console.log('  Invalid selection.\n');
    }
    return null;
  }
  
  const metadata = proposals[index];
  console.log(`\n  Selected: ${metadata.policyTitle}`);
  console.log(`  Connecting to contract...\n`);
  
  try {
    const contract = await api.withStatus(`Connecting to proposal`, () =>
      daoApi.joinDaoContract(providers, metadata.contractAddress),
    );
    console.log(`  ✓ Connected! You can now vote on this proposal.\n`);
    return { contract, metadata };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(`  ✗ Failed to connect: ${msg}\n`);
    return null;
  }
};

const deployOrJoin = async (
  providers: DaoProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<{ contract: DeployedDaoContract; metadata: ProposalMetadata } | null> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const proposals = storage.loadProposals();
    const choice = await rli.question(contractMenu(dustLabel, proposals.length));
    switch (choice.trim()) {
      case '1':
        try {
          // First deploy the contract
          const contract = await api.withStatus('Deploying DAO contract', () =>
            daoApi.deployDaoContract(providers),
          );
          const contractAddress = contract.deployTxData.public.contractAddress;
          console.log(`  Contract deployed at: ${contractAddress}\n`);
          
          // Get current proposal count to determine next proposalId
          const state = await daoApi.getDaoLedgerState(providers, contractAddress);
          const proposalId = state?.proposalCount ?? 0n;
          
          // Get proposal metadata from user
          const metadata = await createProposalMetadata(rli);
          metadata.contractAddress = contractAddress;
          metadata.proposalId = proposalId;
          
          // Create the proposal on-chain
          const metaHash = computeMetaHash(metadata);
          await api.withStatus('Creating proposal on-chain', () =>
            daoApi.createProposal(contract, proposalId, metaHash),
          );
          
          storage.saveProposal(metadata);
          console.log(`  Proposal ${proposalId} created and saved locally!\n`);
          return { contract, metadata };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`\n  ✗ Deploy failed: ${msg}`);
          if (e instanceof Error && e.cause) {
            let cause: unknown = e.cause;
            let depth = 0;
            while (cause && depth < 5) {
              const causeMsg =
                cause instanceof Error
                  ? `${cause.message}\n      ${cause.stack?.split('\n').slice(1, 3).join('\n      ') ?? ''}`
                  : String(cause);
              console.log(`    cause: ${causeMsg}`);
              cause = cause instanceof Error ? cause.cause : undefined;
              depth++;
            }
          }
          if (msg.toLowerCase().includes('dust') || msg.toLowerCase().includes('no dust')) {
            console.log('    Insufficient DUST for transaction fees. Use option [4] to monitor your balance.');
          }
          console.log('');
        }
        break;
      case '2':
        try {
          const contractAddress = await rli.question('Enter the contract address (hex): ');
          const policyType = await rli.question('Enter the policy type: ');
          const policyTitle = await rli.question('Enter the policy title: ');
          const policyDescription = await rli.question('Enter the description: ');
          const contract = await daoApi.joinDaoContract(providers, contractAddress.trim());
          const metadata: ProposalMetadata = {
            policyType: policyType.trim(),
            policyTitle: policyTitle.trim(),
            policyDescription: policyDescription.trim(),
            contractAddress: contractAddress.trim(),
          };
          storage.saveProposal(metadata);
          console.log('  Proposal saved locally!\n');
          return { contract, metadata };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Failed to join contract: ${msg}\n`);
        }
        break;
      case '3': {
        const result = await selectProposal(proposals, providers, rli);
        if (result) return result;
        break;
      }
      case '4':
        await startDustMonitor(walletCtx.wallet, rli);
        break;
      case '5':
        return null;
      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

const displayResults = async (providers: DaoProviders, contract: DeployedDaoContract, proposalId: bigint): Promise<void> => {
  const votes = await daoApi.displayVoteResults(providers, contract, proposalId);
  if (votes) {
    const total = Number(votes.yes) + Number(votes.no) + Number(votes.appeal);
    console.log(`
${DIVIDER}
  Vote Results for Proposal ${proposalId}
${DIVIDER}
  YES:    ${votes.yes}
  NO:     ${votes.no}
  APPEAL: ${votes.appeal}
  ────────────────────
  Total Votes: ${total}
${DIVIDER}
`);
  }
};

const votingLoop = async (
  providers: DaoProviders,
  walletCtx: api.WalletContext,
  contract: DeployedDaoContract,
  metadata: ProposalMetadata,
  rli: Interface,
): Promise<boolean> => {
  const proposalId = metadata.proposalId ?? 0n;
  const contractAddress = contract.deployTxData.public.contractAddress;
  
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(votingMenu(metadata, dustLabel));
    
    // Get current vote counts before voting
    const getCurrentVotes = async (voteType: 'yes' | 'no' | 'appeal'): Promise<bigint> => {
      const votes = await daoApi.getProposalVotes(providers, contractAddress, proposalId);
      if (!votes) return 0n;
      return voteType === 'yes' ? votes.yes : voteType === 'no' ? votes.no : votes.appeal;
    };
    
    switch (choice.trim()) {
      case '1':
        try {
          const currentVotes = await getCurrentVotes('yes');
          await api.withStatus('Voting YES', () => daoApi.voteYes(contract, proposalId, currentVotes));
          console.log('  ✓ Vote submitted successfully!\n');
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Vote failed: ${msg}\n`);
        }
        break;
      case '2':
        try {
          const currentVotes = await getCurrentVotes('no');
          await api.withStatus('Voting NO', () => daoApi.voteNo(contract, proposalId, currentVotes));
          console.log('  ✓ Vote submitted successfully!\n');
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Vote failed: ${msg}\n`);
        }
        break;
      case '3':
        try {
          const currentVotes = await getCurrentVotes('appeal');
          await api.withStatus('Voting APPEAL', () => daoApi.voteAppeal(contract, proposalId, currentVotes));
          console.log('  ✓ Vote submitted successfully!\n');
          return true;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.log(`  ✗ Vote failed: ${msg}\n`);
        }
        break;
      case '4':
        await displayResults(providers, contract, proposalId);
        break;
      case '5':
        return true;
      default:
        console.log(`  Invalid choice: ${choice}`);
    }
  }
};

const mainLoop = async (
  providers: DaoProviders,
  walletCtx: api.WalletContext,
  rli: Interface,
): Promise<void> => {
  while (true) {
    const result = await deployOrJoin(providers, walletCtx, rli);
    if (result === null) {
      return; // Exit
    }

    const { contract, metadata } = result;
    const continueLoop = await votingLoop(providers, walletCtx, contract, metadata, rli);
    if (!continueLoop) {
      return;
    }
    // Loop back to contract menu
  }
};

const mapContainerPort = (env: StartedDockerComposeEnvironment, url: string, containerName: string) => {
  const mappedUrl = new URL(url);
  const container = env.getContainer(containerName);
  mappedUrl.port = String(container.getFirstMappedPort());
  return mappedUrl.toString().replace(/\/+$/, '');
};

export const run = async (config: Config, _logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);
  daoApi.setDaoLogger(_logger);

  console.log(BANNER);

  const rli = createInterface({ input, output, terminal: true });
  let env: StartedDockerComposeEnvironment | undefined;

  try {
    if (dockerEnv !== undefined) {
      env = await dockerEnv.up();

      if (config instanceof StandaloneConfig) {
        config.indexer = mapContainerPort(env, config.indexer, 'counter-indexer');
        config.indexerWS = mapContainerPort(env, config.indexerWS, 'counter-indexer');
        config.node = mapContainerPort(env, config.node, 'counter-node');
        config.proofServer = mapContainerPort(env, config.proofServer, 'counter-proof-server');
      }
    }

    const walletCtx = await buildWallet(config, rli);
    if (walletCtx === null) {
      return;
    }

    try {
      const providers = await api.withStatus('Configuring providers', () => daoApi.configureDaoProviders(walletCtx, config));
      console.log('');

      await mainLoop(providers, walletCtx, rli);
    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Error: ${e.message}`);
        logger.debug(`${e.stack}`);
      } else {
        throw e;
      }
    } finally {
      try {
        await walletCtx.wallet.stop();
      } catch (e) {
        logger.error(`Error stopping wallet: ${e}`);
      }
    }
  } finally {
    rli.close();
    rli.removeAllListeners();

    if (env !== undefined) {
      try {
        await env.down();
      } catch (e) {
        logger.error(`Error shutting down docker environment: ${e}`);
      }
    }

    logger.info('Goodbye.');
  }
};

import chalk from "chalk";
import { BN, toBuffer } from "ethereumjs-util";

import { HARDHAT_NETWORK_NAME } from "../../../constants";
import { HttpProvider } from "../../../core/providers/http";
import { JsonRpcClient } from "../../jsonrpc/client";
import { ForkConfig } from "../node-types";

import {
  FALLBACK_MAX_REORG,
  getLargestPossibleReorg,
} from "./reorgs-protection";

export async function makeForkClient(
  forkConfig: ForkConfig,
  forkCachePath?: string
): Promise<{ forkClient: JsonRpcClient; forkBlockNumber: BN }> {
  const provider = new HttpProvider(
    forkConfig.jsonRpcUrl,
    HARDHAT_NETWORK_NAME
  );

  const networkId = await getNetworkId(provider);
  const actualMaxReorg = getLargestPossibleReorg(networkId);
  const maxReorg = actualMaxReorg ?? FALLBACK_MAX_REORG;

  const latestBlock = await getLatestBlockNumber(provider);
  const lastSafeBlock = latestBlock - maxReorg;

  let forkBlockNumber;
  if (forkConfig.blockNumber !== undefined) {
    if (forkConfig.blockNumber > lastSafeBlock) {
      const confirmations = latestBlock - forkConfig.blockNumber + 1;
      const requiredConfirmations = maxReorg + 1;
      console.warn(
        chalk.yellow(
          `You are forking from block ${
            forkConfig.blockNumber
          }, which has less than ${requiredConfirmations} confirmations, and will affect Hardhat Network's performance.
Please use block number ${lastSafeBlock} or wait for the block to get ${
            requiredConfirmations - confirmations
          } more confirmations.`
        )
      );
    }

    forkBlockNumber = new BN(forkConfig.blockNumber);
  } else {
    forkBlockNumber = new BN(lastSafeBlock);
  }

  const cacheToDiskEnabled =
    forkConfig.blockNumber !== undefined &&
    forkCachePath !== undefined &&
    actualMaxReorg !== undefined;

  const forkClient = new JsonRpcClient(
    provider,
    networkId,
    latestBlock,
    maxReorg,
    cacheToDiskEnabled ? forkCachePath : undefined
  );

  return { forkClient, forkBlockNumber };
}

async function getNetworkId(provider: HttpProvider) {
  const networkIdString = (await provider.request({
    method: "net_version",
  })) as string;
  return parseInt(networkIdString, 10);
}

async function getLatestBlockNumber(provider: HttpProvider) {
  const latestBlockString = (await provider.request({
    method: "eth_blockNumber",
  })) as string;

  const latestBlock = new BN(toBuffer(latestBlockString));
  return latestBlock.toNumber();
}
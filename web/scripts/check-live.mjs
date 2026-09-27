import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  createPublicClient,
  http,
  keccak256,
  encodeAbiParameters,
  parseAbiParameters,
} from "viem";
import { json, root } from "./shared.mjs";

const config = json("dist/imd-deployment.json");
const report = {
  checkedAt: new Date().toISOString(),
  broadcastTransactions: false,
  endpoints: [],
};
const token = config.contracts.find((c) => c.name === "Band");
const hook = config.contracts.find((c) => c.name === "PriceBandHook");
const poolId = keccak256(
  encodeAbiParameters(
    parseAbiParameters("address, address, uint24, int24, address"),
    [
      config.pool.pairedCurrency,
      token.address,
      config.pool.fee,
      config.pool.tickSpacing,
      hook.address,
    ],
  ),
);
for (const url of config.network.rpcUrls) {
  const client = createPublicClient({
    transport: http(url, { timeout: 12000, retryCount: 0 }),
  });
  const result = { url };
  try {
    result.chainId = await client.getChainId();
    if (result.chainId !== config.chainId)
      throw new Error("RPC chain mismatch");
    const addresses = [
      ...config.contracts,
      config.swapRouter,
      ...Object.entries(config.network.uniswapV4).map(([name, address]) => ({
        name,
        address,
      })),
    ];
    result.code = await Promise.all(
      addresses.map(async ({ name, address }) => {
        const code = await client.getCode({ address });
        if (!code || code === "0x")
          throw new Error(`${name}: no deployed code`);
        return { name, address, bytes: (code.length - 2) / 2 };
      }),
    );
    const block = await client.getBlock();
    result.blockNumber = block.number;
    result.blockTimestamp = block.timestamp;
    const stateAbi = json(`dist/${config.infrastructureAbis.stateView}`);
    const hookAbi = json(`dist/${hook.abiPath}`);
    result.poolId = poolId;
    result.slot0 = await client.readContract({
      address: config.network.uniswapV4.stateView,
      abi: stateAbi,
      functionName: "getSlot0",
      args: [poolId],
      blockNumber: block.number,
    });
    result.band = await client.readContract({
      address: hook.address,
      abi: hookAbi,
      functionName: "band",
      args: [poolId],
      blockNumber: block.number,
    });
    result.lastTick = await client.readContract({
      address: hook.address,
      abi: hookAbi,
      functionName: "lastTick",
      args: [poolId],
      blockNumber: block.number,
    });
    result.pass = true;
  } catch (error) {
    result.pass = false;
    result.error = error.shortMessage ?? error.message;
  }
  report.endpoints.push(result);
  console.log(
    url,
    result.pass ? `PASS at block ${result.blockNumber}` : result.error,
  );
}
writeFileSync(
  resolve(root, "docs/frontend/live-rpc.json"),
  JSON.stringify(
    report,
    (_, value) => (typeof value === "bigint" ? value.toString() : value),
    2,
  ) + "\n",
);
if (!report.endpoints.some((r) => r.pass)) process.exitCode = 1;

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { isAddress, parseAbi } from "viem";
import { root, handoff, network, ui, abiHash } from "./shared.mjs";

assert.equal(handoff.chainId, network.network.chainId);
assert.equal(Number(network.walletAddChain.chainId), handoff.chainId);
assert(isAddress(ui.swapRouter.address));
for (const address of Object.values(network.network.uniswapV4))
  assert(isAddress(address));
mkdirSync(resolve(root, "web/public/abi"), { recursive: true });
for (const contract of handoff.contracts) {
  assert(isAddress(contract.address));
  assert(/^[A-Za-z][A-Za-z0-9]*$/.test(contract.name));
  const file = `docs/abi/${contract.name}.json`;
  const committed = execFileSync(
    "git",
    ["show", `${handoff.sourceCommit}:${file}`],
    { cwd: root },
  );
  assert.deepEqual(
    JSON.parse(readFileSync(resolve(root, file))),
    JSON.parse(committed),
    `${file}: differs from pinned commit`,
  );
  assert.equal(
    abiHash(JSON.parse(committed)),
    contract.abiHash,
    `${contract.name}: ABI hash mismatch`,
  );
  writeFileSync(
    resolve(root, `web/public/abi/${contract.name}.json`),
    committed,
  );
  console.log(
    `${contract.name}: pinned source ABI verified (${contract.abiHash})`,
  );
}
// Infrastructure interfaces match the pinned local PoolSwapTest and official Uniswap lens interfaces.
const key =
  "(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)";
const sharedErrors = [
  "error WrappedError(address target, bytes4 selector, bytes reason, bytes details)",
  "error PriceOutOfBand(int24 tick, int24 lower, int24 upper)",
  "error PriceLimitAlreadyExceeded(uint160 sqrtPriceCurrentX96, uint160 sqrtPriceLimitX96)",
  "error PoolNotInitialized()",
];
const interfaces = {
  PoolSwapTest: parseAbi([
    `function swap(${key} key, (bool zeroForOne, int256 amountSpecified, uint160 sqrtPriceLimitX96) params, (bool takeClaims, bool settleUsingBurn) testSettings, bytes hookData) payable returns (int256 delta)`,
    "function manager() view returns (address)",
    ...sharedErrors,
  ]),
  StateView: parseAbi([
    "function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)",
    "function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)",
    "function poolManager() view returns (address)",
  ]),
  V4Quoter: parseAbi([
    `function quoteExactInputSingle((${key} poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)`,
    "function poolManager() view returns (address)",
    ...sharedErrors,
    "error NotEnoughLiquidity(bytes32 poolId)",
    "error UnexpectedRevertBytes(bytes revertData)",
  ]),
};
for (const [name, abi] of Object.entries(interfaces)) {
  writeFileSync(
    resolve(root, `web/public/abi/${name}.json`),
    JSON.stringify(abi, null, 2) + "\n",
  );
}

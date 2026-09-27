import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import { root, handoff, network, ui, inventory } from "./shared.mjs";

const assets = inventory();
assert(assets.length > 0 && assets.length <= 128);
let bytes = 0;
for (const asset of assets) {
  const size = readFileSync(resolve(root, "dist", asset.path)).length;
  assert(size <= 8388608);
  bytes += size;
}
assert(
  bytes < 8 * 1024 * 1024,
  "Export must leave room in the complete 8 MiB submission",
);
const { launchId, chainId, sourceCommit, attestationHash } = handoff;
const output = {
  version: 1,
  launchId,
  chainId,
  sourceCommit,
  attestationHash,
  contracts: handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
  assets,
  network: network.network,
  walletAddChain: network.walletAddChain,
  pool: handoff.manifest.pool,
  ...ui,
};
// Retain the exact whitespace and bytes of the supplied network object as well as its JSON value.
const raw = readFileSync(resolve(root, "web/config/network.json"), "utf8");
const block = raw.slice(
  raw.indexOf("{", raw.indexOf('"network"')),
  raw.indexOf(',\n  "walletAddChain"'),
);
const rendered = JSON.stringify(output, null, 2);
const begin = rendered.indexOf("{", rendered.indexOf('"network"'));
const end = rendered.indexOf(',\n  "walletAddChain"');
writeFileSync(
  resolve(root, "dist/imd-deployment.json"),
  rendered.slice(0, begin) + block + rendered.slice(end) + "\n",
);
console.log(
  `Manifest: ${assets.length} assets, ${bytes} bytes; network block preserved verbatim.`,
);

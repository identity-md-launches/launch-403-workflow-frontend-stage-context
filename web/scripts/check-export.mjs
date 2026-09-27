import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  root,
  json,
  handoff,
  network,
  ui,
  inventory,
  abiHash,
} from "./shared.mjs";

const manifest = json("dist/imd-deployment.json");
for (const field of ["launchId", "chainId", "sourceCommit", "attestationHash"])
  assert.deepEqual(manifest[field], handoff[field]);
assert.equal(manifest.version, 1);
assert.deepEqual(manifest.network, network.network);
assert.deepEqual(manifest.walletAddChain, network.walletAddChain);
assert.deepEqual(manifest.pool, handoff.manifest.pool);
assert.deepEqual(manifest.swapRouter, ui.swapRouter);
assert.deepEqual(
  manifest.contracts,
  handoff.contracts.map(({ name, address, abiHash }) => ({
    name,
    address,
    abiHash,
    abiPath: `abi/${name}.json`,
  })),
);
assert.deepEqual(manifest.assets, inventory());
assert(manifest.assets.length <= 128);
for (const asset of manifest.assets) {
  assert(
    /^[a-zA-Z0-9_./-]+$/.test(asset.path) &&
      !asset.path.startsWith("/") &&
      !asset.path.split("/").includes(".."),
  );
  assert(/^[a-f0-9]{64}$/.test(asset.sha256));
  assert(readFileSync(resolve(root, "dist", asset.path)).length <= 8388608);
}
for (const contract of manifest.contracts)
  assert.equal(abiHash(json(`dist/${contract.abiPath}`)), contract.abiHash);
const html = readFileSync(resolve(root, "dist/index.html"), "utf8");
assert(!/(?:src|href)="\/(?!\/)/.test(html), "Root-absolute asset URL");
console.log(
  "PASS: exact handoff, network, pinned ABIs, complete SHA-256 inventory, relative export and size limits.",
);

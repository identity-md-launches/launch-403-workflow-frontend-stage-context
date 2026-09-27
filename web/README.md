# Band frontend

A single-page React + TypeScript frontend for the deployed Sepolia ETH/BAND pool. Vite emits plain files to `../dist/` with `base: './'`. No backend, secrets, private RPC URLs, wallet project ID, or deployment transaction is needed.

## Install, build, preview

Use Node 24 and npm 11 (the worker used 24.21.0 and 11.19.0):

```sh
cd web
npm ci --cache .cache/npm
npm run typecheck
npm run build
npm run check:export
npm run preview
```

The production export is `dist/` at the repository root. Serve it over HTTPS; `localhost` HTTP also supports the Web Crypto integrity checks. Open `index.html` through a static server, not `file://`. The page works at a gateway subpath without rewrites. `npm run dev` serves source with the **same generated `dist/imd-deployment.json`** through a development-only Vite middleware; build once before starting development. Rebuild after changing any configuration or ABI.

## Configuration and ABI provenance

The only runtime deployment configuration is `dist/imd-deployment.json`. `src/config.ts` fetches it and the ABI files it references. There is no bundled address/chain map. Build inputs are retained under `web/config/` because the assignment's `.imd/reads/` inputs are removed after delivery:

- `deployment.json`: unchanged deployment handoff, including deployed source commit and attestation.
- `network.json`: unchanged vetted network and `walletAddChain` parameters.
- `interface.json`: the workflow's explicitly approved PoolSwapTest address and paths to infrastructure interfaces.

`scripts/prepare.mjs` obtains `docs/abi/Band.json` and `docs/abi/PriceBandHook.json` using `git show` at source commit `966128c1f665ea0383c2014af7edbb7dd5d5d9ee`. It requires the working copies to agree, checks canonical Keccak-256, and copies the exact pinned bytes. The source commit must be available locally when rebuilding. Canonicalization recursively sorts object keys, preserves array order, and hashes compact UTF-8 JSON. The verified hashes are:

| Contract | Canonical Keccak-256 |
| --- | --- |
| Band | `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee` |
| PriceBandHook | `39dbd5ffe5d94c293b1efd1fadde66fbbba67ef54b44cd6a74dc5c9615d364d1` |

The infrastructure ABI subsets are generated from the pinned local `PoolSwapTest.sol` signatures and the official [V4Quoter interface](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol) and [StateView interface](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IStateView.sol). These are auxiliary interfaces, not additions to the attested contract set. They are recorded in the asset inventory. Runtime loading checks each ABI's SHA-256 and both implementation ABIs' canonical Keccak hashes.

After Vite finishes, `scripts/manifest.mjs` writes the manifest, copying the exact contract set and identifiers. Its `network` object preserves both the supplied JSON value and the original block's bytes. Additional fields are `walletAddChain`, `pool`, `swapRouter`, and `infrastructureAbis`. Every other exported file, including the font license and all five ABIs, receives a lowercase SHA-256 entry. Do not edit `dist/` by hand; run the build again.

## Reads, wallets, and swaps

`src/chain.ts` checks the configured RPC chain, nonempty code, and PoolManager bindings before exposing a usable market. It reads slot0, the current band, last observed tick, liquidity, token decimals and symbol from one block. Connected accounts also receive ETH/BAND balances and their PoolSwapTest allowance. Reads poll every 15 seconds, with manual refresh. An old block (over 120 seconds), an old read (over 45 seconds), or a failed refresh disables transactions. Configured public RPCs fail over in order; a connected wallet on the correct chain is the final read fallback.

The connector uses an injected EIP-1193 browser wallet (`window.ethereum`). It handles rejection, missing wallets, account/chain events and local disconnect. For an unknown chain, switching with error 4902 leads to the exact `wallet_addEthereumChain` handoff parameters, then another switch. WalletConnect is not configured because no public project ID was supplied. Local disconnect does not revoke wallet permissions.

### Router choice and conflicting generic guidance

This assignment and its approved workflow explicitly require **PoolSwapTest**, which accepts `sqrtPriceLimitX96` and returns unspent ETH. The generic reference's Universal Router / Permit2 path cannot express that pool price limit. Therefore swaps and BAND approvals use the explicit workflow router from `manifest.swapRouter`; quotes and state reads use `manifest.network.uniswapV4.quoter` and `stateView`. The network object is unchanged. Universal Router and Permit2 are displayed as network references but are not called or approved. This is an intentional resolution of the conflicting generic criterion, not a claim to implement both routes.

The pool key derives from the handoff's native paired currency, token/hook entries, fee, and tick spacing. This page supports that attested native-ETH pool only. It never substitutes the manifest's illustrative `initialPrice` for live slot0.

- Buy: `zeroForOne = true`, exact input is negative, ETH transaction value equals the requested maximum input, and no token approval is sent.
- Sell: show a separate approval for exactly the entered BAND amount to PoolSwapTest; wait for its successful receipt before previewing. No Permit2 approval is involved.
- Default limit: exact integer TickMath at `lower + 1` for buys or `upper - 1` for sells, clamped to usable core bounds. The one-tick inset handles the falling initialized-edge case. The 0.5%, 1%, and 3% options further limit adverse **BAND-per-ETH terminal price movement** with integer arithmetic. Before the first hour, an explicit movement option is required.
- Quote: call V4Quoter's `quoteExactInputSingle` with `simulateContract` only. Its unrestricted quote may revert for oversized inputs. In parallel, simulate the exact bounded PoolSwapTest call; decode signed BalanceDelta halves into expected spend/receive and show partial fills and unspent input. A successful bounded simulation can be reviewed even if the unrestricted quote fails.
- Confirm: verify wallet identity, chain, balances, allowances and current band; re-simulate. Changed fills, changed band, account/form changes, or preview expiry require another review. Settings are `(takeClaims=false, settleUsingBurn=false)` and hookData is `0x` (the hook ignores it). Signing is always through the wallet.

**PoolSwapTest has no minimum-output field or on-chain deadline.** The interface does not invent either guarantee. The 45-second / hour-boundary preview expiry is an interface rule; it cannot expire a transaction already handed to a wallet or waiting in the mempool. The mined fill can change within the signed price limit. Network gas is additional. A partially filled sell can leave a remaining token allowance. The page states the material execution limits before confirmation.

## Verification

```sh
cd web
npx --cache .cache/npm playwright install chromium
npm test
npm run check:live
```

If the default browser installation location is read-only, install with `PLAYWRIGHT_BROWSERS_PATH=.cache/playwright` and set the same variable for `npm test`. Alternatively, `BAND_BROWSER_PATH=/absolute/path/to/chrome npm test` uses an existing Chromium binary; this is how the worker used its preinstalled browser. Test configuration is isolated to `web/playwright.config.ts`. Tests serve the **built export** at `/preview/band/` and intercept RPC/wallet requests; they never broadcast transactions. The static test server is not shipped as a backend.

`check:live` performs read-only calls against every supplied public RPC, saving chain ID, code lengths and pool reads in `docs/frontend/live-rpc.json`. It is distinct from mocked wallet tests. See [validation](../docs/frontend/VALIDATION.md), [design](../docs/DESIGN.md), and [attribution](../docs/frontend/ATTRIBUTION.md). Contracts and protected root configuration remain unchanged.

The publisher can host `dist/` as-is after source delivery. This worker did not publish, pin IPFS, name a site, or redeploy contracts. Those services' checks do not replace the included browser and interaction evidence.

## Write-scope and commit limitations

The assignment's overriding write budget allows `web/**`, `dist/**`, `docs/**`, and **explicitly `web/.gitignore`**. That is the only changed ignore file; its recursive patterns exclude dependencies, caches, Playwright working results, and TypeScript build info at every depth under `web/`. Root `DESIGN.md` is outside that budget, so the complete requested document is delivered as `docs/DESIGN.md`.

The worker attempted `git add -- web dist docs/frontend`; Git failed because `.git/index.lock` is on a read-only filesystem. No commit to this workspace was possible. All requested source, lockfile, generated export, manifest and evidence are present for the contributor submission mechanism to record. The optional packaging rehearsal uses only the explicitly disposable `test/scratch/` area, not this read-only Git database.

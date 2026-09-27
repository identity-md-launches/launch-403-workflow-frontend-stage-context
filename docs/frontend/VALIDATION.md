# Frontend validation

Worker report, 2026-09-27 UTC. These observations are not an independent network certification.

## Scope, inputs and decisions

Implemented the one-page, backend-free ETH/BAND frontend against the supplied deployed contracts. Read the pinned workflow, deployment/network handoffs, Better Interface workflow and all six domain cores, implementation sources/ABIs, and both protected floor suites. The protected suites concern already deployed contracts; this frontend assignment did **not** rerun deployment, alter Solidity, or claim a new contract audit.

Vite/React/TypeScript source and lockfile are under `web/`; the final export is `dist/`. Deployment data and implementation ABIs are fetched at runtime from the exported manifest and its referenced files. Build-time canonical ABI checks use the exact handoff source commit. No backend, wallet project key, private RPC credential, or vendored dependency archive is required.

Scope resolutions:

- The explicit assignment requires PoolSwapTest and `sqrtPriceLimitX96`. This overrides the reference's generic Universal Router/Permit2 instructions and the inconsistent generic routing criterion. PoolSwapTest is stored in the manifest's `swapRouter` extension; the supplied `network` block remains byte-for-byte unchanged. All quote/state Uniswap addresses come from it. Approval spender equals the actual PoolSwapTest router. See `web/README.md` for the execution limits.
- The root `DESIGN.md` criterion conflicts with the overriding write budget. The complete design document is at **`docs/DESIGN.md`**; no root document or root configuration was modified.
- No wallet project ID was supplied; an injected browser wallet is supported. No admin UI, liquidity management, or general token-transfer page is added to this bounded swap assignment.
- Read-only live RPC checks and mocked signing/receipt tests are separate evidence. No real transaction was signed or broadcast.

## Commands and results

The final source run is preserved in [`validation-run.log`](validation-run.log). Commands ran from `web/`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed, exit 0 |
| `npm run build` | Passed, exit 0; source ABIs verified; manifest generated after export |
| `npm run check:export` | Passed, exit 0; exact identifiers/contract set/network/wallet parameters, both ABI hashes, complete file inventory, relative URLs and file limits |
| `BAND_BROWSER_PATH=/home/imd2/.cache/ms-playwright/chromium-1246/chrome-linux64/chrome npm test` | 22 passed; built static export served at `/preview/band/` |
| `npm run check:live` | Passed, exit 0; all three configured public RPCs returned chain 11155111 and nonempty code; pool reads recorded |
| `git diff --check` | Passed |

The initial package install needed `--cache .cache/npm` because the global npm cache is read-only. The first build caught an unavailable font CSS subpath; it was repaired to import the local Latin WOFF2 directly. The installed Playwright release expected a different browser revision, so the worker used its preinstalled Chromium through the documented optional executable override. These setup failures are not presented as successful checks. Vite reports a nonfatal >500 kB minified chunk warning; the complete export is about 0.61 MiB, with the main JavaScript about 165 kB gzipped. No performance timing or slow-device claim is made.

Machine-readable results: [`test-results.json`](test-results.json), [`accessibility.json`](accessibility.json), [`live-rpc.json`](live-rpc.json). The static export declares 12 assets, below the 128-asset limit. Each asset is under 8 MiB and the export is far below both the submission and HTTP response budgets. The packaging rehearsal and scope check are recorded in [`submission-size.json`](submission-size.json).

## Meaningful interaction coverage

Tests use encoded RPC results and an EIP-1193 mock against the production files, not a special test-only application route:

- Disconnected reads and missing-wallet recovery; rejected connection.
- Wrong chain; failed switch with 4902; exact add-chain parameters; retry switch.
- Native buy: quoter address, negative exact input, one-tick-inside lower bound, ETH value, no approval, simulation before signing, successful receipt/explorer link.
- BAND sell: explicit exact-amount approval to the actual router, successful approval receipt, upper bound, no ETH input value, successful swap.
- Oversized partial fill with an unrestricted quoter revert; visible spend, receive, unspent input and bounded simulation details.
- Wrapped `PriceOutOfBand` decoding, failed simulation, wallet rejection, reverted receipt.
- Zero/negative/scientific notation/excess precision/insufficient amounts; editable inputs invalidate review.
- Account and chain events invalidate review; local disconnect clears balances; expired previews cannot sign; an updated hour band forces re-review.
- Inactive first hour requires an explicit price movement limit. Outside-band corrective direction remains available; outward direction is blocked.
- Zero active liquidity does not block a first buy; missing pool initialization does. RPC failures, missing code, wrong RPC chain and stale blocks fail closed. Refresh restores successful reads.
- ABI tampering blocks runtime initialization before transaction controls exist.
- Integer TickMath endpoint/unit-tick vectors, bounded limits/core endpoints, token decimal parsing, and signed packed delta decoding.

## Better Interface review: six domains

| Domain | Coverage | Evidence and limitations |
| --- | --- | --- |
| Accessibility | **Checked** | Native controls, labels, `aria-pressed`, named graph, skip link, linked field errors, stable status region and alert errors. Keyboard direction selection and visible focus inspected. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tags: no detected violations at 1440, 800, 390 and 320px. Reduced motion verified. No screen-reader session, native browser zoom, OS forced-colors session, or physical-device test. |
| Layout | **Checked** | DOM follows market → swap → explanation → details. Rendered screenshots inspected at 1440, 800 and 320px. Automated overflow checks passed at those widths and 390px. 200% text enlargement and RTL reflow stress passed at 800px; they are not localization or browser-native zoom coverage. |
| Writing | **Checked** | Action labels correspond to wallet/swap steps; exact token units, testnet notice and partial-fill semantics are visible. Unknown values are dashes. RPC, signature, contract and receipt failures have separate recovery messages. Minimum output/deadline limitations appear before confirm. |
| Typography | **Checked** | Local variable font loaded, text hierarchy and number stability reviewed. Live 50,000,000-scale prices fit after the mobile correction. Full deployment addresses wrap. Scientific notation represents very small ETH-per-BAND rates. No non-Latin font coverage claimed. |
| Colors | **Checked** | Source roles reviewed; actual rendered text/background pairs measured. See [`rendered-checks.json`](rendered-checks.json) and status/error measurements. Text pairs exceed 4.5:1; measured input/focus pairs exceed 3:1. One light theme; no dark theme exists. The selected swap-direction outline was strengthened. Full manual contrast coverage of every possible state is not claimed. |
| UI details | **Checked** | Default, hover, focus, selected, loading, disabled, disconnected, inactive, stale, error and partial-fill states reviewed in source and exercised where applicable. Flat surfaces, one lime primary action, local icons, no modal focus trap. Press transitions are 120ms and absent under reduced motion. Slow-motion playback and touch-hover behavior on a physical device were not tested. |

## Findings, fixes and rechecks

Source locations below refer to the final formatted source.

| Severity / domain | Location | Finding → correction → evidence |
| --- | --- | --- |
| Medium / layout | `web/src/App.tsx:128` | Both outside plot segments preceded the band, skewing the diagram. Moved the ending segment after the band. Final desktop/tablet/mobile screenshots show equal outer segments. |
| Medium / typography | `web/src/styles.css:1034` | Real 50-million-scale rates wrapped in narrow two-column cards. Metrics stack below 480px. `mobile-reflow.json` confirms both rates occupy one line at 320px; final mobile screenshot inspected. |
| Medium / writing + layout | `web/src/styles.css:954` | Testnet explanation was hidden in the first mobile layout. It now flows below the hero. Visibility asserted at all four test widths. |
| Medium / writing | `web/src/chain.ts:52` | Broad error matching replaced receipt failure and chain mismatch messages with a generic network error, and obscured a wrapped wallet rejection. Narrowed transport detection and checked rejection causes. Revert, rejection and RPC-recovery tests now pass. |
| Medium / transaction state | `web/src/chain.ts:422` | Final review identified that freshness should also be checked inside actions, rather than relying only on disabled controls. Approval rereads balances/block; preview/swap balance checks enforce age. Stale-data interaction test passes. |
| Medium / colors | `web/src/styles.css:577` | Selected direction relied on a subtle light surface difference. Its outline now uses the main text token. Final screenshots and accessibility run rechecked. |
| Low / writing | `web/src/App.tsx:940` | Footer implied every signature checked a swap price, including token approvals. Changed to “Swap simulated before confirmation.” Source and rendered screenshot rechecked. |
| Low / typography | `web/src/App.tsx:952` | Hiding a decorative line break joined “sets” and “the” on mobile. Added normal word spacing. Final mobile screenshot rechecked. |
| Low / UI | `web/src/App.tsx:467` | The first countdown frame could say 46 seconds because the UI clock predated preview creation. Reset the UI clock with the preview. The actual 45-second signing gate was already independent; expiry test and regenerated partial-fill screenshot rechecked. |

There are no known unresolved blocking interface defects in the exercised flows. Tests do not prove future chain behavior.

## Rendered evidence

- [`desktop-live.png`](desktop-live.png): 1440px, live public RPC reads, disconnected wallet.
- [`tablet-live.png`](tablet-live.png): 800px, live public RPC reads, stacked layout.
- [`mobile-live.png`](mobile-live.png): 320px, live public RPC reads, stacked prices and visible testnet notice.
- [`keyboard-focus.png`](keyboard-focus.png): keyboard focus on the sell-direction control in the final interface.
- [`partial-fill-mocked.png`](partial-fill-mocked.png): simulated partial buy and quoter rejection using mock data, not a live trade.
- [`mobile-mocked.png`](mobile-mocked.png): final 320px mocked flow.
- [`browser-console.txt`](browser-console.txt): no errors/warnings on the inspected live-read export.
- [`browser-network.txt`](browser-network.txt): local static resources and public RPC calls from that inspection; no failed requests.

Both the automated test browser and manual browser session were closed. Tool-created temporary browser files outside the write scope were removed; only the explicit documentation artifacts remain.

## Remaining limits and delivery status

**Useful source/export/evidence are complete; the workspace Git commit is blocked by filesystem permissions.** The attempted `git add -- web dist docs/frontend` failed with `Unable to create .../.git/index.lock: Read-only file system` (exit 128). No workspace commit is claimed. A separate disposable packaging rehearsal does not change that limitation. No approval was requested because this worker cannot elevate filesystem access.

Root `DESIGN.md` was intentionally not written under the overriding scope rule; use `docs/DESIGN.md`. The router/network criterion conflict is resolved explicitly above. These are disclosed departures from the inconsistent generic criteria.

Untested live-chain behavior includes actual wallet-extension integration, signed approvals, swaps/mined partial fills, transaction replacement, real gas estimation/payment, mempool races and hour-boundary inclusion. No real funds or testnet transactions were used for validation. Browser-native 200% zoom, assistive-technology sessions, Safari/Firefox, physical mobile devices and OS high-contrast mode remain unverified. The app has no minimum-output or on-chain expiry guarantee because the required router exposes neither.

No publication URL/CID, fixed-CID verification, named-entrypoint verification, new attestation, or independent service acceptance is claimed. The publisher and control plane perform those steps after source delivery.

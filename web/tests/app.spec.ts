import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { decodeFunctionData, type Abi } from "viem";
import { readFileSync, writeFileSync } from "node:fs";
import { mockApp, deployment, ACCOUNT, NEXT_ACCOUNT, token } from "./mocks";
import { sqrtAtTick } from "../src/math";

const routerAbi = JSON.parse(
  readFileSync(
    new URL("../../dist/abi/PoolSwapTest.json", import.meta.url),
    "utf8",
  ),
) as Abi;
const tokenAbi = JSON.parse(
  readFileSync(new URL("../../dist/abi/Band.json", import.meta.url), "utf8"),
) as Abi;
async function connect(page: import("@playwright/test").Page) {
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Disconnect wallet ${ACCOUNT}` }),
  ).toBeVisible();
  await expect(page.getByText("Balance: 100 ETH")).toBeVisible();
}

test("relative export loads all assets, shows live reads disconnected and handles missing wallet", async ({
  page,
}) => {
  await mockApp(page, { wallet: false });
  const errors: string[] = [],
    failures: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("requestfailed", (r) => failures.push(r.url()));
  await page.goto("./");
  await expect(page.getByText("Band active", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("img", { name: /Current tick -500/ }),
  ).toBeVisible();
  await expect(page.getByText("00", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Connect wallet to swap" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "No browser wallet found",
  );
  expect(errors).toEqual([]);
  expect(failures).toEqual([]);
});

test("wrong network offers switch, adds an unknown chain using exact handoff parameters", async ({
  page,
}) => {
  const state = await mockApp(page, { wrongChain: true, unknownChain: true });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByText("Your wallet is on another network.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Switch to Sepolia" }).click();
  await expect(page.getByText("Balance: 100 ETH")).toBeVisible();
  expect(state.requests.filter((r) => r.startsWith("wallet_"))).toEqual([
    "wallet_switchEthereumChain",
    "wallet_addEthereumChain",
    "wallet_switchEthereumChain",
  ]);
  expect(await page.evaluate(() => (window as any).__addedChain)).toEqual(
    deployment.walletAddChain,
  );
  expect(state.sent).toHaveLength(0);
});

test("buy quotes the configured quoter and signs only the simulated band-limited PoolSwapTest call", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your buy" }),
  ).toBeVisible();
  expect(state.sent).toHaveLength(0);
  expect(state.calls.find((c) => c.name === "quoteExactInputSingle")?.to).toBe(
    deployment.network.uniswapV4.quoter,
  );
  await page.getByRole("button", { name: "Confirm buy", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Swap confirmed");
  expect(state.sent).toHaveLength(1);
  const tx = state.sent[0];
  expect(tx.to).toBe(deployment.swapRouter.address);
  expect(BigInt(tx.value!)).toBe(10n ** 18n);
  const call = decodeFunctionData({ abi: routerAbi, data: tx.data });
  expect(call.functionName).toBe("swap");
  expect(call.args![1]).toEqual({
    zeroForOne: true,
    amountSpecified: -(10n ** 18n),
    sqrtPriceLimitX96: sqrtAtTick(-2230),
  });
  expect(call.args![2]).toEqual({ takeClaims: false, settleUsingBurn: false });
  expect(call.args![3]).toBe("0x");
  expect(
    state.calls.filter((c) => c.name === "swap").length,
  ).toBeGreaterThanOrEqual(2);
  await expect(
    page.getByRole("link", { name: /View transaction/ }),
  ).toHaveAttribute("href", /sepolia.etherscan.io\/tx\//);
});

test("sell approves exactly the entered amount to PoolSwapTest, then previews and swaps with no ETH value", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("./");
  await connect(page);
  await page.getByRole("button", { name: "Sell BAND", exact: true }).click();
  await page.getByLabel("You pay up to").fill("2");
  await page.getByRole("button", { name: "Approve BAND", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "BAND approval confirmed",
  );
  expect(state.sent[0].to).toBe(token.address);
  const approval = decodeFunctionData({
    abi: tokenAbi,
    data: state.sent[0].data,
  });
  expect(String(approval.args![0]).toLowerCase()).toBe(
    deployment.swapRouter.address,
  );
  expect(approval.args![1]).toBe(2n * 10n ** 18n);
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your sell" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm sell", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Swap confirmed");
  expect(state.sent).toHaveLength(2);
  const sell = decodeFunctionData({ abi: routerAbi, data: state.sent[1].data });
  expect(sell.args![1]).toEqual({
    zeroForOne: false,
    amountSpecified: -(2n * 10n ** 18n),
    sqrtPriceLimitX96: sqrtAtTick(1822),
  });
  expect(BigInt(state.sent[1].value ?? "0x0")).toBe(0n);
});

test("oversized input shows partial fill even when unrestricted quoter would revert", async ({
  page,
}) => {
  const state = await mockApp(page, {
    state: { partial: true, quoteError: true },
  });
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(page.getByText("Partial fill", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Swap preview")).toContainText("0.5 ETH");
  await page
    .getByText("Quote and transaction details", { exact: true })
    .click();
  await expect(
    page.getByText(/bounded router simulation succeeded/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toBeEnabled();
  expect(state.sent).toHaveLength(0);
  await page.screenshot({
    path: "../docs/frontend/partial-fill-mocked.png",
    fullPage: true,
  });
});

test("decoded hook reverts and wallet rejections are recoverable and never silently sign", async ({
  page,
}) => {
  const state = await mockApp(page, { state: { swapError: true } });
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("hourly band");
  expect(state.sent).toHaveLength(0);
  state.swapError = false;
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  state.rejectSend = true;
  await page.getByRole("button", { name: "Confirm buy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("declined");
  expect(state.sent).toHaveLength(0);
});

test("connection rejection is shown with retry", async ({ page }) => {
  await mockApp(page, { rejectConnect: true });
  await page.goto("./");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("declined");
  await expect(
    page.getByRole("button", { name: "Connect wallet to swap" }),
  ).toBeEnabled();
});

test("invalid precision, zero, insufficient balance and changed inputs block confirmation", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("./");
  await connect(page);
  for (const value of ["0", "-1", "1e3", "0.0000000000000000001", "101"]) {
    await page.getByLabel("You pay up to").fill(value);
    await expect(
      page.getByRole("button", { name: "Preview swap", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("You pay up to")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  }
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toBeVisible();
  await page.getByLabel("You pay up to").fill("2");
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toHaveCount(0);
  expect(state.sent).toHaveLength(0);
});

test("account and chain events invalidate reviewed fills, disconnect clears balances", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toBeVisible();
  await page.evaluate(
    (account) => (window as any).__changeWallet(account, "0x1"),
    NEXT_ACCOUNT,
  );
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Switch to Sepolia" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Disconnect wallet ${NEXT_ACCOUNT}` })
    .click();
  await expect(page.getByText("Balance: Connect to view")).toBeVisible();
  expect(state.sent).toHaveLength(0);
});

test("expired previews cannot sign", async ({ page }) => {
  const state = await mockApp(page);
  await page.clock.install();
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toBeVisible();
  await page.clock.fastForward(46000);
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Expired — preview again")).toBeVisible();
  expect(state.sent).toHaveLength(0);
});

test("changed hourly band before signing forces a fresh review", async ({
  page,
}) => {
  const state = await mockApp(page);
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm buy", exact: true }),
  ).toBeVisible();
  state.average = -100;
  await page.getByRole("button", { name: "Confirm buy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("hourly band changed");
  expect(state.sent).toHaveLength(0);
});

test("inactive first hour requires an explicit price movement limit", async ({
  page,
}) => {
  const state = await mockApp(page, { state: { active: false } });
  await page.goto("./");
  await connect(page);
  await expect(page.getByText("Band inactive", { exact: true })).toBeVisible();
  await page.getByLabel("You pay up to").fill("1");
  await expect(
    page.getByRole("button", { name: "Preview swap", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Price limit", { exact: true }).selectOption("100");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your buy" }),
  ).toBeVisible();
  expect(state.sent).toHaveLength(0);
});

test("outside band allows return direction but blocks movement farther out", async ({
  page,
}) => {
  await mockApp(page, { state: { tick: -3000, allowance: 100n * 10n ** 18n } });
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await expect(page.getByText("Outside band", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview swap", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Sell BAND", exact: true }).click();
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Review your sell" }),
  ).toBeVisible();
});

test("reverted receipt keeps explorer link and reports no completed swap", async ({
  page,
}) => {
  await mockApp(page, { state: { receiptReverted: true } });
  await page.goto("./");
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await page.getByRole("button", { name: "Preview swap", exact: true }).click();
  await page.getByRole("button", { name: "Confirm buy", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Swap reverted");
  await expect(
    page.getByRole("link", { name: /View transaction/ }),
  ).toBeVisible();
});

test("RPC failures recover on refresh, missing code and wrong RPC chain fail closed", async ({
  page,
}) => {
  const state = await mockApp(page, {
    wallet: false,
    state: { rpcError: true },
  });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("Unable to read Sepolia");
  state.rpcError = false;
  state.missingCode = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("No deployed code");
  state.missingCode = false;
  state.wrongRpcChain = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("different chain");
  state.wrongRpcChain = false;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.getByText("Band active", { exact: true })).toBeVisible();
});

test("uninitialized pool and stale block never enable transactions", async ({
  page,
}) => {
  const state = await mockApp(page, { state: { poolMissing: true } });
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText(
    "pool is not initialized",
  );
  state.poolMissing = false;
  state.blockAge = 180;
  await connect(page);
  await page.getByLabel("You pay up to").fill("1");
  await expect(
    page.getByRole("button", { name: "Waiting for fresh pool data" }),
  ).toBeDisabled();
  await expect(
    page.getByText("Pool data is too old to trade.", { exact: false }),
  ).toBeVisible();
  expect(state.sent).toHaveLength(0);
});

test("ABI tampering stops runtime initialization", async ({ page }) => {
  await mockApp(page);
  await page.route("**/abi/Band.json", (route) => route.fulfill({ json: [] }));
  await page.goto("./");
  await expect(page.getByRole("alert")).toContainText("integrity check failed");
  await expect(
    page.getByRole("button", { name: "Reload configuration" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Confirm/ })).toHaveCount(0);
});

test("responsive reflow, keyboard focus, local font and accessibility audit", async ({
  page,
}) => {
  await mockApp(page);
  await page.goto("./");
  await expect(page.getByText("Band active", { exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to pool" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Buy BAND", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Sell BAND", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("button", { name: "Sell BAND", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const findings = [];
  for (const width of [1440, 800, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await expect(
      page.getByText("Test tokens only. No real value.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("You pay up to")).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    findings.push({
      width,
      violations: audit.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        nodes: v.nodes.map((n) => n.target),
      })),
    });
    expect(audit.violations).toEqual([]);
  }
  await page.screenshot({
    path: "../docs/frontend/mobile-mocked.png",
    fullPage: true,
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await page
      .locator(".primary")
      .evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0s");
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
    document.documentElement.dir = "rtl";
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => {
    document.documentElement.dir = "ltr";
  });
  expect(
    await page.evaluate(() =>
      document.fonts.check('500 16px "DM Sans Variable"'),
    ),
  ).toBeTruthy();
  writeFileSync(
    new URL("../../docs/frontend/accessibility.json", import.meta.url),
    JSON.stringify(
      {
        findings,
        checks: [
          "keyboard",
          "four widths",
          "200% text enlargement",
          "RTL reflow stress",
          "reduced motion",
          "font loaded",
        ],
        limitation:
          "Automated checks are not a screen-reader session or browser-native zoom test.",
      },
      null,
      2,
    ) + "\n",
  );
});

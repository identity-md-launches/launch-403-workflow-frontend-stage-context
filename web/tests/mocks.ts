import { readFileSync } from "node:fs";
import {
  decodeFunctionData,
  encodeFunctionResult,
  encodeErrorResult,
  toHex,
  type Abi,
  type Hex,
} from "viem";
import type { Page } from "@playwright/test";
import { sqrtAtTick } from "../src/math";

export const deployment = JSON.parse(
  readFileSync(
    new URL("../../dist/imd-deployment.json", import.meta.url),
    "utf8",
  ),
);
export const token = deployment.contracts.find(
  (c: { name: string }) => c.name === "Band",
);
export const hook = deployment.contracts.find(
  (c: { name: string }) => c.name === "PriceBandHook",
);
const abi = [
  "Band",
  "PriceBandHook",
  "PoolSwapTest",
  "StateView",
  "V4Quoter",
].flatMap((name) =>
  JSON.parse(
    readFileSync(
      new URL(`../../dist/abi/${name}.json`, import.meta.url),
      "utf8",
    ),
  ),
) as Abi;
export const ACCOUNT = "0x1111111111111111111111111111111111111111";
export const NEXT_ACCOUNT = "0x2222222222222222222222222222222222222222";
const HASH = ("0x" + "12".repeat(32)) as Hex;
const ZERO = "0x" + "00".repeat(32);
export type MockState = {
  sent: { to: string; data: Hex; value?: string }[];
  requests: string[];
  calls: { to: string; name: string; args: readonly unknown[] }[];
  allowance: bigint;
  tick: number;
  average: number;
  active: boolean;
  rpcError: boolean;
  missingCode: boolean;
  quoteError: boolean;
  swapError: boolean;
  rejectSend: boolean;
  receiptReverted: boolean;
  partial: boolean;
  blockAge: number;
  nativeBalance: bigint;
  tokenBalance: bigint;
  poolMissing: boolean;
  wrongRpcChain: boolean;
};
export async function mockApp(
  page: Page,
  options: {
    wallet?: boolean;
    wrongChain?: boolean;
    rejectConnect?: boolean;
    unknownChain?: boolean;
    state?: Partial<MockState>;
  } = {},
) {
  const state: MockState = {
    sent: [],
    requests: [],
    calls: [],
    allowance: 0n,
    tick: -500,
    average: 0,
    active: true,
    rpcError: false,
    missingCode: false,
    quoteError: false,
    swapError: false,
    rejectSend: false,
    receiptReverted: false,
    partial: false,
    blockAge: 0,
    nativeBalance: 10n ** 20n,
    tokenBalance: 1000n * 10n ** 18n,
    poolMissing: false,
    wrongRpcChain: false,
    ...options.state,
  };
  await page.exposeFunction(
    "__mockSend",
    async (transaction: { to: string; data: Hex }) => {
      if (state.rejectSend) throw new Error("User rejected the request");
      const decoded = decodeFunctionData({ abi, data: transaction.data });
      state.sent.push(transaction);
      if (decoded.functionName === "approve" && !state.receiptReverted)
        state.allowance = decoded.args![1] as bigint;
      return HASH;
    },
  );
  await page.exposeFunction("__mockRequest", (method: string) => {
    state.requests.push(method);
  });
  if (options.wallet !== false)
    await page.addInitScript(
      ({ wrongChain, rejectConnect, unknownChain, account, targetChain }) => {
        const win = window as any;
        let currentAccount = account,
          chain = wrongChain ? "0x1" : targetChain,
          added = !unknownChain;
        const listeners: Record<string, ((arg: unknown) => void)[]> = {};
        win.ethereum = {
          request: async ({
            method,
            params,
          }: {
            method: string;
            params: any[];
          }) => {
            await win.__mockRequest(method);
            if (method === "eth_requestAccounts" && rejectConnect)
              throw { code: 4001, message: "User rejected request" };
            if (method === "eth_accounts" || method === "eth_requestAccounts")
              return currentAccount ? [currentAccount] : [];
            if (method === "eth_chainId") return chain;
            if (method === "wallet_switchEthereumChain") {
              if (!added) throw { code: 4902, message: "Unknown chain" };
              chain = params[0].chainId;
              listeners.chainChanged?.forEach((cb) => cb(chain));
              return null;
            }
            if (method === "wallet_addEthereumChain") {
              added = true;
              win.__addedChain = params[0];
              return null;
            }
            if (method === "eth_sendTransaction")
              return win.__mockSend(params[0]);
            throw new Error("Unexpected wallet request: " + method);
          },
          on: (event: string, cb: (arg: unknown) => void) => {
            (listeners[event] ??= []).push(cb);
          },
          removeListener: (event: string, cb: (arg: unknown) => void) => {
            listeners[event] = listeners[event]?.filter((c) => c !== cb);
          },
        };
        win.__changeWallet = (newAccount: string, newChain?: string) => {
          currentAccount = newAccount;
          if (newChain) {
            chain = newChain;
            listeners.chainChanged?.forEach((cb) => cb(chain));
          }
          listeners.accountsChanged?.forEach((cb) =>
            cb(currentAccount ? [currentAccount] : []),
          );
        };
      },
      {
        wrongChain: options.wrongChain,
        rejectConnect: options.rejectConnect,
        unknownChain: options.unknownChain,
        account: ACCOUNT,
        targetChain: deployment.walletAddChain.chainId,
      },
    );
  await page.route(
    (url) => deployment.network.rpcUrls.includes(url.href.replace(/\/$/, "")),
    async (route) => {
      if (state.rpcError) {
        await route.fulfill({ status: 503, body: "RPC unavailable" });
        return;
      }
      const payload = route.request().postDataJSON();
      const process = (request: {
        method: string;
        params: any[];
        id: number;
      }) => {
        try {
          let result: unknown;
          const timestamp = toHex(
            BigInt(Math.floor(Date.now() / 1000) - state.blockAge),
          );
          const { method, params } = request;
          if (method === "eth_chainId")
            result = toHex(state.wrongRpcChain ? 1 : deployment.chainId);
          else if (method === "eth_getCode")
            result = state.missingCode ? "0x" : "0x6001600055";
          else if (method === "eth_blockNumber") result = "0x100";
          else if (method === "eth_getBlockByNumber")
            result = {
              number: "0x100",
              hash: ZERO,
              parentHash: ZERO,
              timestamp,
              transactions: [],
              gasLimit: "0x1c9c380",
              gasUsed: "0x0",
              baseFeePerGas: "0x1",
              difficulty: "0x0",
              extraData: "0x",
              miner: ACCOUNT,
              nonce: "0x0000000000000000",
              size: "0x1",
              uncles: [],
              logsBloom: "0x" + "00".repeat(256),
            };
          else if (method === "eth_getBalance")
            result = toHex(state.nativeBalance);
          else if (method === "eth_getTransactionReceipt")
            result = {
              transactionHash: HASH,
              transactionIndex: "0x0",
              blockHash: ZERO,
              blockNumber: "0x100",
              from: ACCOUNT,
              to: deployment.swapRouter.address,
              cumulativeGasUsed: "0x186a0",
              gasUsed: "0x186a0",
              contractAddress: null,
              logs: [],
              logsBloom: "0x" + "00".repeat(256),
              status: state.receiptReverted ? "0x0" : "0x1",
              effectiveGasPrice: "0x1",
              type: "0x2",
            };
          else if (method === "eth_call") {
            const call = params[0];
            const { functionName: name, args } = decodeFunctionData({
              abi,
              data: call.data,
            });
            state.calls.push({ to: call.to, name, args: args ?? [] });
            let output: unknown;
            if (name === "poolManager" || name === "manager")
              output = deployment.network.uniswapV4.poolManager;
            else if (name === "getSlot0")
              output = [
                state.poolMissing ? 0n : sqrtAtTick(state.tick),
                state.tick,
                0,
                3000,
              ];
            else if (name === "getLiquidity")
              output = 0n; // One-sided launch: zero active liquidity must not block buys.
            else if (name === "band")
              output = state.active
                ? [
                    true,
                    state.average,
                    state.average - 2231,
                    state.average + 1823,
                    BigInt(Math.floor(Date.now() / 3600000) - 1),
                  ]
                : [false, 0, 0, 0, 0n];
            else if (name === "lastTick") output = state.tick;
            else if (name === "decimals") output = 18;
            else if (name === "symbol") output = "BAND";
            else if (name === "balanceOf") output = state.tokenBalance;
            else if (name === "allowance") output = state.allowance;
            else if (name === "approve") output = true;
            else if (name === "quoteExactInputSingle") {
              if (state.quoteError) throw new Error("band");
              output = [
                ((args![0] as { exactAmount: bigint }).exactAmount * 9n) / 10n,
                100000n,
              ];
            } else if (name === "swap") {
              if (state.swapError) throw new Error("band");
              const swap = args![1] as {
                zeroForOne: boolean;
                amountSpecified: bigint;
              };
              const spent = -swap.amountSpecified / (state.partial ? 2n : 1n),
                received = (spent * 9n) / 10n;
              const [a0, a1] = swap.zeroForOne
                ? [-spent, received]
                : [received, -spent];
              output = BigInt.asIntN(
                256,
                (BigInt.asUintN(128, a0) << 128n) | BigInt.asUintN(128, a1),
              );
            } else throw new Error(`Unknown function ${name}`);
            result = encodeFunctionResult({
              abi,
              functionName: name,
              result: output,
            });
          } else throw new Error(`Unknown RPC request ${method}`);
          return { jsonrpc: "2.0", id: request.id, result };
        } catch (e) {
          const data = encodeErrorResult({
            abi,
            errorName: "WrappedError",
            args: [
              hook.address,
              "0x00000000",
              encodeErrorResult({
                abi,
                errorName: "PriceOutOfBand",
                args: [-2232, -2231, 1823],
              }),
              "0x00000000",
            ],
          });
          return {
            jsonrpc: "2.0",
            id: request.id,
            error: {
              code: -32000,
              message:
                (e as Error).message === "band"
                  ? "execution reverted"
                  : (e as Error).message,
              data,
            },
          };
        }
      };
      await route.fulfill({
        json: Array.isArray(payload) ? payload.map(process) : process(payload),
      });
    },
  );
  return state;
}

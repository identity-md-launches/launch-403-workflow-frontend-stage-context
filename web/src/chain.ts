import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  custom,
  decodeErrorResult,
  defineChain,
  encodeAbiParameters,
  fallback,
  http,
  keccak256,
  parseAbiParameters,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import type { Config } from "./config";
import { unpackDelta, type Band } from "./math";
import { walletIdentity, type Provider } from "./wallet";

export interface Market {
  band: Band;
  sqrtPrice: bigint;
  tick: number;
  lastTick: number;
  liquidity: bigint;
  decimals: number;
  symbol: string;
  nativeBalance: bigint;
  tokenBalance: bigint;
  allowance: bigint;
  blockNumber: bigint;
  blockTimestamp: bigint;
  fetchedAt: number;
}
export interface Preview {
  amount: bigint;
  spent: bigint;
  received: bigint;
  limit: bigint;
  buy: boolean;
  quotedOutput?: bigint;
  quoteError?: string;
  createdAt: number;
  expiresAt: number;
  band: Band;
  account: Address;
  blockNumber: bigint;
}

export function errorMessage(error: unknown, config?: Config): string {
  const plain = error as {
    code?: number;
    message?: string;
    shortMessage?: string;
  };
  if (
    plain.code === 4001 ||
    /user rejected|user denied|rejected (?:the )?request|denied (?:the )?request/i.test(
      String(error),
    )
  )
    return "Request declined in your wallet. Nothing further was submitted; you can try again.";
  if (config && error instanceof BaseError) {
    const reverted = error.walk(
      (e) => e instanceof ContractFunctionRevertedError,
    );
    if (reverted instanceof ContractFunctionRevertedError && reverted.data) {
      let data = reverted.data;
      for (let i = 0; i < 4; i++) {
        if (data.errorName === "PriceOutOfBand")
          return `The swap would leave the hourly band (tick ${data.args?.[0]}, edges ${data.args?.[1]} to ${data.args?.[2]}). Refresh the band and preview again.`;
        const index =
          data.errorName === "WrappedError"
            ? 2
            : data.errorName === "UnexpectedRevertBytes"
              ? 0
              : -1;
        if (index < 0) break;
        try {
          data = decodeErrorResult({
            abi: [...config.routerAbi, ...config.hook.abi],
            data: data.args?.[index] as Hex,
          });
        } catch {
          break;
        }
      }
      return `Contract rejected the request: ${data.errorName}. Refresh the pool or reduce the amount, then retry.`;
    }
  }
  const message = plain.shortMessage ?? plain.message ?? "The request failed.";
  if (
    /failed to fetch|fetch failed|HTTP request failed|request timed out|timeout|network request failed|failed to get block/i.test(
      message,
    )
  )
    return "Unable to read Sepolia. Check your connection and use Refresh to retry. Swaps stay disabled until fresh data loads.";
  return message.length > 400 ? message.slice(0, 400) + "…" : message;
}

export function makeService(config: Config, provider?: Provider) {
  const d = config.deployment;
  if (d.pool.pairedCurrency.toLowerCase() !== zeroAddress)
    throw new Error("This interface requires the attested native ETH pool.");
  const chain = defineChain({
    id: d.chainId,
    name: d.network.name,
    nativeCurrency: d.network.nativeCurrency,
    rpcUrls: { default: { http: d.network.rpcUrls } },
    testnet: d.network.testnet,
  });
  const transport = fallback(
    [
      ...d.network.rpcUrls.map((url) =>
        http(url, { timeout: 8000, retryCount: 0 }),
      ),
      ...(provider ? [custom(provider, { retryCount: 0 })] : []),
    ],
    { retryCount: 0, rank: false },
  );
  const client = createPublicClient({
    chain,
    transport,
    batch: { multicall: false },
  });
  const key = {
    currency0: d.pool.pairedCurrency,
    currency1: config.token.address,
    fee: d.pool.fee,
    tickSpacing: d.pool.tickSpacing,
    hooks: config.hook.address,
  };
  const poolId = keccak256(
    encodeAbiParameters(
      parseAbiParameters("address, address, uint24, int24, address"),
      [key.currency0, key.currency1, key.fee, key.tickSpacing, key.hooks],
    ),
  );
  let verified = false;
  async function verify() {
    if ((await client.getChainId()) !== d.chainId)
      throw new Error(
        "The RPC returned a different chain. Swaps are disabled.",
      );
    if (verified) return;
    const contracts = [
      ...d.contracts,
      { name: "PoolManager", address: d.network.uniswapV4.poolManager },
      { name: d.swapRouter.name, address: d.swapRouter.address },
      { name: "StateView", address: d.network.uniswapV4.stateView },
      { name: "V4Quoter", address: d.network.uniswapV4.quoter },
    ];
    await Promise.all(
      contracts.map(async (contract) => {
        const code = await client.getCode({ address: contract.address });
        if (!code || code === "0x")
          throw new Error(
            `No deployed code found for ${contract.name}. Transactions are disabled.`,
          );
      }),
    );
    const bindings = await Promise.all([
      client.readContract({ ...config.hook, functionName: "poolManager" }),
      client.readContract({
        address: d.swapRouter.address,
        abi: config.routerAbi,
        functionName: "manager",
      }),
      client.readContract({
        address: d.network.uniswapV4.stateView,
        abi: config.stateAbi,
        functionName: "poolManager",
      }),
      client.readContract({
        address: d.network.uniswapV4.quoter,
        abi: config.quoterAbi,
        functionName: "poolManager",
      }),
    ]);
    if (
      bindings.some(
        (value) =>
          String(value).toLowerCase() !==
          d.network.uniswapV4.poolManager.toLowerCase(),
      )
    )
      throw new Error(
        "A contract uses a different PoolManager. Swaps are disabled.",
      );
    verified = true;
  }
  async function readMarket(account?: Address): Promise<Market> {
    await verify();
    const block = await client.getBlock({ blockTag: "latest" });
    if (block.number === null)
      throw new Error(
        "The latest confirmed block is unavailable. Refresh to retry.",
      );
    const blockNumber = block.number;
    const [
      slot,
      band,
      lastTick,
      liquidity,
      decimals,
      symbol,
      nativeBalance,
      tokenBalance,
      allowance,
    ] = await Promise.all([
      client.readContract({
        address: d.network.uniswapV4.stateView,
        abi: config.stateAbi,
        functionName: "getSlot0",
        args: [poolId],
        blockNumber,
      }),
      client.readContract({
        ...config.hook,
        functionName: "band",
        args: [poolId],
        blockNumber,
      }),
      client.readContract({
        ...config.hook,
        functionName: "lastTick",
        args: [poolId],
        blockNumber,
      }),
      client.readContract({
        address: d.network.uniswapV4.stateView,
        abi: config.stateAbi,
        functionName: "getLiquidity",
        args: [poolId],
        blockNumber,
      }),
      client.readContract({
        ...config.token,
        functionName: "decimals",
        blockNumber,
      }),
      client.readContract({
        ...config.token,
        functionName: "symbol",
        blockNumber,
      }),
      account
        ? client.getBalance({ address: account, blockNumber })
        : Promise.resolve(0n),
      account
        ? client.readContract({
            ...config.token,
            functionName: "balanceOf",
            args: [account],
            blockNumber,
          })
        : Promise.resolve(0n),
      account
        ? client.readContract({
            ...config.token,
            functionName: "allowance",
            args: [account, d.swapRouter.address],
            blockNumber,
          })
        : Promise.resolve(0n),
    ]);
    const [sqrtPrice, tick] = slot as [bigint, number, number, number];
    const [active, average, lower, upper, hour] = band as [
      boolean,
      number,
      number,
      number,
      bigint,
    ];
    if (sqrtPrice === 0n)
      throw new Error("The pool is not initialized. Swaps are unavailable.");
    if (
      !Number.isInteger(decimals) ||
      Number(decimals) < 0 ||
      Number(decimals) > 36 ||
      symbol !== "BAND"
    )
      throw new Error("Token metadata is inconsistent. Swaps are disabled.");
    return {
      band: { active, average, lower, upper, hour },
      sqrtPrice,
      tick,
      lastTick: lastTick as number,
      liquidity: liquidity as bigint,
      decimals: decimals as number,
      symbol,
      nativeBalance,
      tokenBalance: tokenBalance as bigint,
      allowance: allowance as bigint,
      blockNumber,
      blockTimestamp: block.timestamp,
      fetchedAt: Date.now(),
    };
  }
  async function ensureIdentity(account: Address, guard: () => boolean) {
    if (!provider || !guard())
      throw new Error(
        "Wallet or form changed. Preview again before continuing.",
      );
    const identity = await walletIdentity(provider);
    if (
      identity.chainId !== d.chainId ||
      identity.account?.toLowerCase() !== account.toLowerCase() ||
      !guard()
    )
      throw new Error(
        "Wallet or network changed. Reconnect and preview again.",
      );
  }
  function swapRequest(
    account: Address,
    amount: bigint,
    buy: boolean,
    limit: bigint,
  ) {
    return {
      address: d.swapRouter.address,
      abi: config.routerAbi,
      functionName: "swap",
      args: [
        key,
        { zeroForOne: buy, amountSpecified: -amount, sqrtPriceLimitX96: limit },
        { takeClaims: false, settleUsingBurn: false },
        "0x",
      ],
      account,
      value: buy ? amount : 0n,
    } as const;
  }
  function checkBalances(market: Market, amount: bigint, buy: boolean) {
    if (
      Date.now() - market.fetchedAt > 45000 ||
      Date.now() - Number(market.blockTimestamp) * 1000 > 120000
    )
      throw new Error(
        "Pool data is too old to trade. Refresh and preview again.",
      );
    if (amount > (buy ? market.nativeBalance : market.tokenBalance))
      throw new Error(
        `Insufficient ${buy ? "ETH" : "BAND"} balance. Reduce the amount and leave ETH for gas.`,
      );
    if (!buy && market.allowance < amount)
      throw new Error(
        "Approve BAND for PoolSwapTest before previewing this sell.",
      );
    if (market.nativeBalance === 0n)
      throw new Error(
        "You need Sepolia ETH for gas. Use a faucet and refresh your balance.",
      );
  }
  async function preview(
    account: Address,
    amount: bigint,
    buy: boolean,
    limit: bigint,
    market: Market,
  ): Promise<Preview> {
    checkBalances(market, amount, buy);
    const [quote, simulation] = await Promise.allSettled([
      client.simulateContract({
        address: d.network.uniswapV4.quoter,
        abi: config.quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: key,
            zeroForOne: buy,
            exactAmount: amount,
            hookData: "0x",
          },
        ],
        account,
        blockNumber: market.blockNumber,
      }),
      client.simulateContract({
        ...swapRequest(account, amount, buy, limit),
        blockNumber: market.blockNumber,
      }),
    ]);
    if (simulation.status === "rejected") throw simulation.reason;
    const { spent, received } = unpackDelta(
      simulation.value.result as bigint,
      buy,
    );
    if (spent <= 0n || received <= 0n || spent > amount)
      throw new Error(
        "No fill is available at this price limit. Try the other direction or wait for liquidity.",
      );
    const createdAt = Date.now();
    return {
      account,
      amount,
      buy,
      limit,
      spent,
      received,
      band: market.band,
      blockNumber: market.blockNumber,
      createdAt,
      expiresAt: Math.min(
        createdAt + 45000,
        createdAt + Number(3600n - (market.blockTimestamp % 3600n)) * 1000,
      ),
      ...(quote.status === "fulfilled"
        ? { quotedOutput: (quote.value.result as [bigint, bigint])[0] }
        : { quoteError: errorMessage(quote.reason, config) }),
    };
  }
  async function approve(
    account: Address,
    amount: bigint,
    guard: () => boolean,
    submitted: (hash: Hex) => void,
  ) {
    const market = await readMarket(account);
    if (Date.now() - Number(market.blockTimestamp) * 1000 > 120000)
      throw new Error(
        "Pool data is too old to approve against. Refresh and retry.",
      );
    if (amount > market.tokenBalance || market.nativeBalance === 0n)
      throw new Error(
        "Insufficient BAND or ETH for this approval. Refresh your balance and reduce the amount.",
      );
    await ensureIdentity(account, guard);
    const simulation = await client.simulateContract({
      ...config.token,
      functionName: "approve",
      args: [d.swapRouter.address, amount],
      account,
    });
    await ensureIdentity(account, guard);
    const wallet = createWalletClient({ chain, transport: custom(provider!) });
    const hash = await wallet.writeContract(simulation.request);
    submitted(hash);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 120000,
    });
    if (receipt.status !== "success")
      throw new Error(
        "Approval reverted. Check the transaction in the explorer and retry.",
      );
    return receipt;
  }
  async function swap(
    preview: Preview,
    guard: () => boolean,
    submitted: (hash: Hex) => void,
  ) {
    await ensureIdentity(preview.account, guard);
    if (Date.now() >= preview.expiresAt)
      throw new Error("The preview expired. Preview the swap again.");
    const market = await readMarket(preview.account);
    checkBalances(market, preview.amount, preview.buy);
    if (
      market.band.active !== preview.band.active ||
      market.band.hour !== preview.band.hour ||
      market.band.lower !== preview.band.lower ||
      market.band.upper !== preview.band.upper
    )
      throw new Error(
        "The hourly band changed. Preview again to review the new price limit.",
      );
    const simulation = await client.simulateContract(
      swapRequest(preview.account, preview.amount, preview.buy, preview.limit),
    );
    const result = unpackDelta(simulation.result as bigint, preview.buy);
    // A changed fill requires a new review; the on-chain price limit remains the only execution bound.
    if (result.received !== preview.received || result.spent !== preview.spent)
      throw new Error(
        "The simulated fill changed. Preview again to review the updated amounts.",
      );
    await ensureIdentity(preview.account, guard);
    if (Date.now() >= preview.expiresAt)
      throw new Error(
        "The preview expired during verification. Preview again.",
      );
    const wallet = createWalletClient({ chain, transport: custom(provider!) });
    const hash = await wallet.writeContract(simulation.request);
    submitted(hash);
    const receipt = await client.waitForTransactionReceipt({
      hash,
      timeout: 120000,
    });
    if (receipt.status !== "success")
      throw new Error(
        "Swap reverted. No swap was completed; network gas may have been spent. Check the transaction in the explorer.",
      );
    return receipt;
  }
  return { client, poolId, readMarket, preview, approve, swap };
}
export type Service = ReturnType<typeof makeService>;

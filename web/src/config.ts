import { isAddress, keccak256, toBytes, type Abi, type Address } from "viem";

export interface Deployment {
  version: number;
  launchId: string;
  chainId: number;
  sourceCommit: string;
  attestationHash: string;
  contracts: {
    name: string;
    address: Address;
    abiHash: string;
    abiPath: string;
  }[];
  assets: { path: string; sha256: string }[];
  network: {
    chainId: number;
    name: string;
    testnet: boolean;
    rpcUrls: string[];
    explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    faucets: string[];
    uniswapV4: {
      poolManager: Address;
      universalRouter: Address;
      quoter: Address;
      stateView: Address;
      positionManager: Address;
      permit2: Address;
    };
  };
  walletAddChain: {
    chainId: string;
    chainName: string;
    rpcUrls: string[];
    nativeCurrency: { name: string; symbol: string; decimals: number };
    blockExplorerUrls: string[];
  };
  pool: {
    pairedCurrency: Address;
    fee: number;
    tickSpacing: number;
    initialPrice: string;
  };
  swapRouter: { name: string; address: Address; abiPath: string };
  infrastructureAbis: { stateView: string; quoter: string };
}
export interface Config {
  deployment: Deployment;
  token: { address: Address; abi: Abi };
  hook: { address: Address; abi: Abi };
  routerAbi: Abi;
  stateAbi: Abi;
  quoterAbi: Abi;
}

export const canonical = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
const relativePath = (path: string) =>
  /^[a-zA-Z0-9_./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").includes("..");

export async function loadConfig(): Promise<Config> {
  const base = new URL("./", window.location.href);
  const response = await fetch(new URL("imd-deployment.json", base), {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      "Deployment configuration could not load. Reload the page to retry.",
    );
  const deployment: Deployment = await response.json();
  if (
    deployment.version !== 1 ||
    deployment.chainId !== deployment.network.chainId ||
    Number(deployment.walletAddChain.chainId) !== deployment.chainId ||
    !deployment.network.testnet ||
    deployment.contracts.length !== 2 ||
    deployment.assets.length > 128
  )
    throw new Error(
      "Deployment configuration is inconsistent. Swaps are disabled.",
    );
  const addresses = [
    ...deployment.contracts.map((c) => c.address),
    ...Object.values(deployment.network.uniswapV4),
    deployment.swapRouter.address,
  ];
  if (
    addresses.some((a) => !isAddress(a)) ||
    deployment.network.rpcUrls.length === 0
  )
    throw new Error("Deployment addresses or RPC configuration are invalid.");
  async function loadAbi(path: string, expectedHash?: string): Promise<Abi> {
    if (!relativePath(path))
      throw new Error("Unsafe ABI path in deployment configuration.");
    const asset = deployment.assets.find((a) => a.path === path);
    if (!asset || !/^[0-9a-f]{64}$/.test(asset.sha256))
      throw new Error(`ABI is missing from the asset inventory: ${path}`);
    const res = await fetch(new URL(path, base));
    if (!res.ok) throw new Error(`Unable to load ${path}. Reload to retry.`);
    const bytes = await res.arrayBuffer();
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
    if (digest !== asset.sha256)
      throw new Error(`ABI file integrity check failed: ${path}`);
    const abi = JSON.parse(new TextDecoder().decode(bytes)) as Abi;
    if (
      !Array.isArray(abi) ||
      (expectedHash &&
        keccak256(toBytes(canonical(abi))).slice(2) !== expectedHash)
    )
      throw new Error(`ABI does not match the deployment handoff: ${path}`);
    return abi;
  }
  const token = deployment.contracts.find((c) => c.name === "Band");
  const hook = deployment.contracts.find((c) => c.name === "PriceBandHook");
  if (!token || !hook)
    throw new Error(
      "The required token and hook are missing from the deployment.",
    );
  const [tokenAbi, hookAbi, routerAbi, stateAbi, quoterAbi] = await Promise.all(
    [
      loadAbi(token.abiPath, token.abiHash),
      loadAbi(hook.abiPath, hook.abiHash),
      loadAbi(deployment.swapRouter.abiPath),
      loadAbi(deployment.infrastructureAbis.stateView),
      loadAbi(deployment.infrastructureAbis.quoter),
    ],
  );
  return {
    deployment,
    token: { address: token.address, abi: tokenAbi },
    hook: { address: hook.address, abi: hookAbi },
    routerAbi,
    stateAbi,
    quoterAbi,
  };
}

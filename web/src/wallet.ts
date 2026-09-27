import { isAddress, type Address, type EIP1193Provider } from "viem";
import type { Deployment } from "./config";

export type Provider = EIP1193Provider & {
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (
    event: string,
    callback: (...args: unknown[]) => void,
  ) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export function browserWallet(): Provider {
  if (!window.ethereum)
    throw new Error(
      "No browser wallet found. Open this page in an Ethereum wallet browser or install a browser wallet, then retry.",
    );
  return window.ethereum;
}
export async function walletIdentity(
  provider: Provider,
  request = false,
): Promise<{ account: Address | undefined; chainId: number }> {
  const accounts = await provider.request({
    method: request ? "eth_requestAccounts" : "eth_accounts",
  });
  const chainId = Number(await provider.request({ method: "eth_chainId" }));
  return {
    account: accounts[0] && isAddress(accounts[0]) ? accounts[0] : undefined,
    chainId,
  };
}
export async function switchNetwork(
  provider: Provider,
  deployment: Deployment,
) {
  const chainId = deployment.walletAddChain.chainId as `0x${string}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  } catch (error) {
    const err = error as {
      code?: number;
      message?: string;
      data?: { originalError?: { code?: number } };
    };
    if (
      err.code !== 4902 &&
      err.data?.originalError?.code !== 4902 &&
      !/unknown chain|unrecognized chain|chain.*not.*added/i.test(
        err.message ?? "",
      )
    )
      throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [deployment.walletAddChain],
    });
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }],
    });
  }
}

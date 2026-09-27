import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { formatUnits, type Address, type Hex } from "viem";
import { loadConfig, type Config } from "./config";
import { errorMessage, makeService, type Market, type Preview } from "./chain";
import {
  displayNumber,
  inputAmount,
  poolPrice,
  swapLimit,
  tickPrice,
} from "./math";
import {
  browserWallet,
  switchNetwork,
  walletIdentity,
  type Provider,
} from "./wallet";

const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
const units = (amount: bigint, decimals: number) =>
  displayNumber(Number(formatUnits(amount, decimals)));
function Icon({ name }: { name: "arrow" | "refresh" | "external" | "check" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "arrow" && <path d="M5 12h14m-5-5 5 5-5 5" />}
      {name === "refresh" && (
        <>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17" />
        </>
      )}
      {name === "external" && (
        <>
          <path d="M14 4h6v6M20 4 10 14" />
          <path d="M10 4H4v16h16v-6" />
        </>
      )}
      {name === "check" && <path d="m5 12 4 4L19 6" />}
    </svg>
  );
}
function Badge({
  children,
  tone = "",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}
function Rate({
  value,
  inverse = false,
}: {
  value?: number;
  inverse?: boolean;
}) {
  return (
    <>
      <strong className="rate">
        {value === undefined ? "—" : displayNumber(inverse ? 1 / value : value)}
      </strong>
      <span className="unit">{inverse ? "ETH per BAND" : "BAND per ETH"}</span>
    </>
  );
}
function BandPlot({ market, config }: { market?: Market; config: Config }) {
  const active = market?.band.active;
  const position =
    market && active
      ? Math.min(
          98,
          Math.max(
            2,
            ((market.tick - market.band.lower) /
              (market.band.upper - market.band.lower)) *
              100,
          ),
        )
      : 50;
  const averagePosition = (2231 / (2231 + 1823)) * 100;
  const price = (tick: number) =>
    displayNumber(
      tickPrice(
        tick,
        market!.decimals,
        config.deployment.network.nativeCurrency.decimals,
      ),
    );
  return (
    <div className="band-plot">
      <div className="plot-caption">
        <span>Position in the hourly band</span>
        <span>Tick scale</span>
      </div>
      <div
        className={`plot ${active ? "" : "unavailable"}`}
        role="img"
        aria-label={
          active
            ? `Current tick ${market.tick}. Band from ${market.band.lower} to ${market.band.upper}; average ${market.band.average}.`
            : "Band position will appear when an active hourly band is available."
        }
      >
        <div className="plot-outside start" />
        <div className="plot-band">
          <span className="band-pattern" />
          <span
            className="average-line"
            style={{ insetInlineStart: `${averagePosition}%` }}
          />
          {active && (
            <>
              <span
                className="current-marker"
                style={{ insetInlineStart: `${position}%` }}
              >
                <span>Current</span>
                <i />
              </span>
              <span
                className="average-label"
                style={{ insetInlineStart: `${averagePosition}%` }}
              >
                Average
              </span>
            </>
          )}
          {!active && (
            <span className="plot-empty">
              {market
                ? "First hour · band not active yet"
                : "Waiting for verified pool data"}
            </span>
          )}
        </div>
        <div className="plot-outside end" />
      </div>
      <div className="plot-edges">
        <div>
          <span className="eyebrow">Lower edge · ~80%</span>
          <strong>{active ? price(market.band.lower) : "—"}</strong>
          <span>BAND per ETH</span>
        </div>
        <div>
          <span className="eyebrow">Upper edge · ~120%</span>
          <strong>{active ? price(market.band.upper) : "—"}</strong>
          <span>BAND per ETH</span>
        </div>
      </div>
      {active && (
        <p className="reciprocal">
          In ETH per BAND:{" "}
          {displayNumber(
            1 /
              tickPrice(
                market.band.upper,
                market.decimals,
                config.deployment.network.nativeCurrency.decimals,
              ),
          )}
          –
          {displayNumber(
            1 /
              tickPrice(
                market.band.lower,
                market.decimals,
                config.deployment.network.nativeCurrency.decimals,
              ),
          )}
          . The reciprocal reverses the edges.
        </p>
      )}
    </div>
  );
}

export function App() {
  const [config, setConfig] = useState<Config>();
  const [configError, setConfigError] = useState("");
  useEffect(() => {
    let active = true;
    loadConfig()
      .then((c) => {
        if (active) setConfig(c);
      })
      .catch((e) => {
        if (active) setConfigError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, []);
  if (!config)
    return (
      <div className="boot">
        <img src="./band.svg" alt="" width="52" height="52" />
        <h1>Band</h1>
        <p role={configError ? "alert" : "status"}>
          {configError || "Verifying deployment and contract interfaces…"}
        </p>
        {configError && (
          <button onClick={() => window.location.reload()}>
            Reload configuration
          </button>
        )}
      </div>
    );
  return <PoolPage config={config} />;
}

function PoolPage({ config }: { config: Config }) {
  const d = config.deployment;
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [market, setMarket] = useState<Market>();
  const [readError, setReadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [buy, setBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [tolerance, setTolerance] = useState("band");
  const [preview, setPreview] = useState<Preview>();
  const [hash, setHash] = useState<Hex>();
  const [status, setStatus] = useState("");
  const [clock, setClock] = useState(Date.now());
  const intent = useRef(0);
  const reads = useRef(0);
  const wrongChain = Boolean(account && chainId !== d.chainId);
  const service = useMemo(
    () =>
      makeService(
        config,
        account && chainId === d.chainId ? provider : undefined,
      ),
    [config, account, chainId, provider, d.chainId],
  );
  const stale =
    !market ||
    clock - market.fetchedAt > 45000 ||
    clock - Number(market.blockTimestamp) * 1000 > 120000 ||
    Boolean(readError);
  const inputSymbol = buy ? "ETH" : "BAND";
  const outputSymbol = buy ? "BAND" : "ETH";
  const inputDecimals = buy
    ? d.network.nativeCurrency.decimals
    : (market?.decimals ?? 18);
  const outputDecimals = buy
    ? (market?.decimals ?? 18)
    : d.network.nativeCurrency.decimals;
  let parsedAmount = 0n,
    amountError = "";
  try {
    parsedAmount = inputAmount(amount, inputDecimals);
  } catch (e) {
    if (amount) amountError = errorMessage(e);
  }
  const insufficient = Boolean(
    market &&
      account &&
      parsedAmount > (buy ? market.nativeBalance : market.tokenBalance),
  );
  const needsApproval = Boolean(
    !buy && market && market.allowance < parsedAmount,
  );
  let limit: bigint | undefined,
    limitError = "";
  if (market) {
    try {
      limit = swapLimit(market.band, market.sqrtPrice, buy, tolerance);
    } catch (e) {
      limitError = errorMessage(e);
    }
  }
  const canAct = Boolean(
    account &&
      !wrongChain &&
      !stale &&
      !busy &&
      parsedAmount > 0n &&
      !amountError &&
      !insufficient &&
      limit,
  );
  const expired = Boolean(preview && clock >= preview.expiresAt);
  const invalidate = () => {
    intent.current++;
    setPreview(undefined);
    setActionError("");
    setStatus("");
    setHash(undefined);
  };
  const refresh = useCallback(async () => {
    const request = ++reads.current;
    setLoading(true);
    try {
      const next = await service.readMarket(
        account && chainId === d.chainId ? account : undefined,
      );
      if (request === reads.current) {
        setMarket(next);
        setReadError("");
        setClock(Date.now());
      }
    } catch (error) {
      if (request === reads.current) setReadError(errorMessage(error, config));
    } finally {
      if (request === reads.current) setLoading(false);
    }
  }, [service, account, chainId, d.chainId, config]);
  useEffect(() => {
    setMarket(undefined);
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => {
      reads.current++;
      clearInterval(timer);
    };
  }, [refresh]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const changed = () => {
      intent.current++;
      reads.current++;
      setPreview(undefined);
      setMarket(undefined);
      setStatus("Wallet changed. Refreshing balances…");
      walletIdentity(provider)
        .then((identity) => {
          setAccount(identity.account);
          setChainId(identity.chainId);
        })
        .catch(() => {
          setAccount(undefined);
          setChainId(undefined);
        });
    };
    const disconnected = () => {
      intent.current++;
      reads.current++;
      setAccount(undefined);
      setProvider(undefined);
      setPreview(undefined);
      setMarket(undefined);
      setStatus("Wallet disconnected.");
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", changed);
    provider.on?.("disconnect", disconnected);
    return () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", changed);
      provider.removeListener?.("disconnect", disconnected);
    };
  }, [provider]);
  async function connect() {
    invalidate();
    setBusy("Connecting wallet…");
    try {
      const p = browserWallet();
      const identity = await walletIdentity(p, true);
      setProvider(p);
      setAccount(identity.account);
      setChainId(identity.chainId);
      if (!identity.account)
        throw new Error(
          "The wallet did not share an account. Unlock it and connect again.",
        );
    } catch (e) {
      setActionError(errorMessage(e, config));
    } finally {
      setBusy("");
    }
  }
  async function switchChain() {
    if (!provider) return;
    invalidate();
    setBusy("Switching network…");
    try {
      await switchNetwork(provider, d);
      const identity = await walletIdentity(provider);
      setAccount(identity.account);
      setChainId(identity.chainId);
    } catch (e) {
      setActionError(errorMessage(e, config));
    } finally {
      setBusy("");
    }
  }
  async function action(kind: "approve" | "preview" | "swap") {
    if (!account || !market || !canAct || !limit) return;
    const epoch = intent.current;
    const guard = () => intent.current === epoch;
    setActionError("");
    setHash(undefined);
    setBusy(
      kind === "approve"
        ? "Approving BAND…"
        : kind === "swap"
          ? "Confirming swap…"
          : "Simulating swap…",
    );
    setStatus(
      kind === "preview"
        ? "Reading a quote and simulating your price limit…"
        : "Checking the transaction before your wallet opens…",
    );
    const submitted = (tx: Hex) => {
      setHash(tx);
      setStatus("Transaction submitted. Waiting for confirmation…");
    };
    try {
      if (kind === "approve") {
        await service.approve(account, parsedAmount, guard, submitted);
        if (guard()) {
          setStatus("BAND approval confirmed. You can now preview the sell.");
          await refresh();
        }
      } else if (kind === "preview") {
        const fresh = await service.readMarket(account);
        const freshLimit = swapLimit(
          fresh.band,
          fresh.sqrtPrice,
          buy,
          tolerance,
        );
        if (!guard()) return;
        const result = await service.preview(
          account,
          parsedAmount,
          buy,
          freshLimit,
          fresh,
        );
        if (guard()) {
          setMarket(fresh);
          setPreview(result);
          setClock(Date.now());
          setStatus("Simulation complete. Review the fill before confirming.");
        }
      } else if (preview && !expired) {
        await service.swap(preview, guard, submitted);
        if (guard()) {
          setPreview(undefined);
          setAmount("");
          setStatus("Swap confirmed on Sepolia. Balances are refreshing.");
          await refresh();
        }
      }
    } catch (e) {
      if (guard()) {
        setActionError(errorMessage(e, config));
        setStatus("");
        if (kind === "swap") setPreview(undefined);
      }
    } finally {
      setBusy("");
    }
  }
  const currentPrice = market
    ? poolPrice(
        market.sqrtPrice,
        market.decimals,
        d.network.nativeCurrency.decimals,
      )
    : undefined;
  const averagePrice = market?.band.active
    ? tickPrice(
        market.band.average,
        market.decimals,
        d.network.nativeCurrency.decimals,
      )
    : undefined;
  const outside =
    market?.band.active &&
    (market.tick < market.band.lower || market.tick > market.band.upper);
  const hourLabel = market?.band.active
    ? `${new Date(Number(market.band.hour) * 3600000).toISOString().slice(11, 16)}–${new Date((Number(market.band.hour) + 1) * 3600000).toISOString().slice(11, 16)} UTC`
    : "First hour pending";
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to pool
      </a>
      <header className="site-header wrap">
        <a className="brand" href="#main" aria-label="Band home">
          <img src="./band.svg" alt="" width="38" height="38" />
          <span>
            band<span className="brand-period">.</span>
          </span>
        </a>
        <nav aria-label="Main navigation">
          <a href="#pool" className="active">
            The pool
          </a>
          <a href="#how-it-works">How it works</a>
        </nav>
        <div className="header-wallet">
          <span className="network-label">
            <span className="status-dot" />
            {d.network.name}
          </span>
          {account ? (
            <button
              className="wallet-button"
              title={account}
              disabled={Boolean(busy)}
              onClick={() => {
                invalidate();
                setAccount(undefined);
                setProvider(undefined);
                setChainId(undefined);
              }}
              aria-label={`Disconnect wallet ${account}`}
            >
              {short(account)} <span aria-hidden="true">×</span>
            </button>
          ) : (
            <button
              className="wallet-button"
              disabled={Boolean(busy)}
              onClick={() => void connect()}
            >
              Connect wallet <Icon name="arrow" />
            </button>
          )}
        </div>
      </header>
      <main id="main" className="wrap">
        <section className="intro" aria-labelledby="page-title">
          <div>
            <div className="eyebrow intro-label">
              An hourly price band for BAND
            </div>
            <h1 id="page-title">A little room to move.</h1>
            <p>
              A pool that moves with the market, with an hourly price guardrail.
            </p>
          </div>
          <div className="testnet-note">
            <span className="testnet-tag">Testnet experiment</span>
            <span>
              Sepolia ETH + BAND
              <br />
              Test tokens only. No real value.
            </span>
          </div>
        </section>
        <div className="dashboard" id="pool">
          <section className="market-panel" aria-labelledby="market-title">
            <div className="section-heading">
              <div className="pair">
                <div className="pair-coins" aria-hidden="true">
                  <span>Ξ</span>
                  <img src="./band.svg" width="34" height="34" alt="" />
                </div>
                <div>
                  <h2 id="market-title">ETH / BAND</h2>
                  <span className="subtle">
                    Uniswap v4 · {d.pool.fee / 10000}% pool fee
                  </span>
                </div>
              </div>
              <Badge tone={stale ? "neutral" : outside ? "warning" : "success"}>
                {!market
                  ? "Awaiting data"
                  : stale
                    ? "Data stale"
                    : market.band.active
                      ? outside
                        ? "Outside band"
                        : "Band active"
                      : "Band inactive"}
              </Badge>
            </div>
            <div className="market-prices">
              <div>
                <span className="eyebrow">Current price</span>
                <Rate value={currentPrice} />
                <p className="inverse-price">
                  {currentPrice === undefined
                    ? "—"
                    : displayNumber(1 / currentPrice)}{" "}
                  ETH per BAND
                </p>
              </div>
              <div>
                <span className="eyebrow">Last hour’s average</span>
                <Rate value={averagePrice} />
                <p className="inverse-price">
                  {averagePrice === undefined
                    ? "—"
                    : displayNumber(1 / averagePrice)}{" "}
                  ETH per BAND
                </p>
                <span className="hour-label">{hourLabel}</span>
              </div>
            </div>
            <BandPlot market={market} config={config} />
            <div className="band-explanation">
              <span className="small-mark" aria-hidden="true">
                ↔
              </span>
              <p>
                {outside
                  ? "Price is outside the band. Swaps that move strictly closer to the band are still allowed."
                  : "Swaps stop just inside the band edge. Larger orders can fill partially, leaving the rest of your input unspent."}
              </p>
            </div>
            <div className="read-status">
              <span>
                {loading
                  ? "Reading Sepolia…"
                  : market
                    ? `Block ${market.blockNumber.toLocaleString()} · read ${Math.max(0, Math.floor((clock - market.fetchedAt) / 1000))}s ago`
                    : "Pool data unavailable"}
              </span>
              <button
                className="text-button"
                disabled={loading || Boolean(busy)}
                onClick={() => void refresh()}
              >
                <Icon name="refresh" />
                Refresh
              </button>
            </div>
            {readError && (
              <p className="notice error" role="alert">
                {readError}
              </p>
            )}
            {market && stale && !readError && (
              <p className="notice warning">
                Pool data is too old to trade. Refresh to load a recent block.
              </p>
            )}
          </section>
          <section className="swap-panel" aria-labelledby="swap-title">
            <div className="swap-heading">
              <h2 id="swap-title">Swap within the band</h2>
              <span className="small-mark" aria-hidden="true">
                ↗
              </span>
            </div>
            <p className="subtle">
              Set an amount. We’ll find the room to move.
            </p>
            <div className="direction" role="group" aria-label="Swap direction">
              <button
                aria-pressed={buy}
                disabled={Boolean(busy)}
                onClick={() => {
                  invalidate();
                  setBuy(true);
                  setAmount("");
                }}
              >
                Buy BAND
              </button>
              <button
                aria-pressed={!buy}
                disabled={Boolean(busy)}
                onClick={() => {
                  invalidate();
                  setBuy(false);
                  setAmount("");
                }}
              >
                Sell BAND
              </button>
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (canAct) void action(needsApproval ? "approve" : "preview");
              }}
            >
              <div className="amount-box">
                <div className="field-heading">
                  <label htmlFor="amount">You pay up to</label>
                  <span className="token-label">
                    {inputSymbol === "ETH" ? "Ξ" : "B"} <b>{inputSymbol}</b>
                  </span>
                </div>
                <input
                  id="amount"
                  name="amount"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={amount}
                  disabled={Boolean(busy)}
                  aria-invalid={Boolean(amountError || insufficient)}
                  aria-describedby="amount-help"
                  onChange={(e) => {
                    invalidate();
                    setAmount(e.target.value);
                  }}
                />
                <div className="balance">
                  Balance:{" "}
                  {account && market && !wrongChain
                    ? `${units(buy ? market.nativeBalance : market.tokenBalance, inputDecimals)} ${inputSymbol}`
                    : "Connect to view"}
                </div>
              </div>
              <p
                id="amount-help"
                className={`field-help ${amountError || insufficient ? "error-text" : ""}`}
              >
                {amountError ||
                  (insufficient
                    ? `Not enough ${inputSymbol}. Reduce the amount and leave ETH for gas.`
                    : buy
                      ? "Unused ETH is returned automatically. Leave ETH for gas."
                      : "Only the BAND consumed by the swap is spent.")}
              </p>
              <div className="receive-box">
                <div>
                  <span>You receive (estimate)</span>
                  <strong>
                    {preview ? units(preview.received, outputDecimals) : "—"}
                  </strong>
                </div>
                <span className="token-label">{outputSymbol}</span>
              </div>
              <div className="limit-row">
                <label htmlFor="tolerance">Price limit</label>
                <select
                  id="tolerance"
                  value={tolerance}
                  disabled={Boolean(busy)}
                  onChange={(e) => {
                    invalidate();
                    setTolerance(e.target.value);
                  }}
                >
                  <option value="band">Stop at band edge</option>
                  <option value="50">0.5% max movement</option>
                  <option value="100">1% max movement</option>
                  <option value="300">3% max movement</option>
                </select>
              </div>
              <p className="field-help">
                A tighter limit can fill less. Movement is measured in BAND per
                ETH; this is not a minimum-output guarantee.
              </p>
              {limitError && <p className="notice warning">{limitError}</p>}
              {wrongChain && (
                <p className="notice warning">
                  Your wallet is on another network. Switch to {d.network.name}{" "}
                  to trade.
                </p>
              )}
              {preview && (
                <div className="review" aria-label="Swap preview">
                  <div className="review-heading">
                    <h3>Review your {buy ? "buy" : "sell"}</h3>
                    <span className="fill-label">
                      {preview.spent < preview.amount
                        ? "Partial fill"
                        : "Full fill"}
                    </span>
                  </div>
                  <dl>
                    <div>
                      <dt>Expected spend</dt>
                      <dd title={formatUnits(preview.spent, inputDecimals)}>
                        {units(preview.spent, inputDecimals)} {inputSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Expected receive</dt>
                      <dd title={formatUnits(preview.received, outputDecimals)}>
                        {units(preview.received, outputDecimals)} {outputSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Unspent input</dt>
                      <dd>
                        {units(preview.amount - preview.spent, inputDecimals)}{" "}
                        {inputSymbol}
                      </dd>
                    </div>
                    <div>
                      <dt>Terminal price limit</dt>
                      <dd>
                        {displayNumber(
                          poolPrice(
                            preview.limit,
                            market!.decimals,
                            d.network.nativeCurrency.decimals,
                          ),
                        )}{" "}
                        BAND / ETH
                      </dd>
                    </div>
                    <div>
                      <dt>Preview expires</dt>
                      <dd>
                        {expired
                          ? "Expired — preview again"
                          : `in ${Math.max(0, Math.ceil((preview.expiresAt - clock) / 1000))}s`}
                      </dd>
                    </div>
                  </dl>
                  <p>
                    PoolSwapTest enforces the price limit, but has no minimum
                    output or on-chain deadline. The fill can change before
                    inclusion.
                  </p>
                  <details>
                    <summary>Quote and transaction details</summary>
                    <p>
                      {preview.quotedOutput !== undefined
                        ? `V4Quoter full-input estimate: ${units(preview.quotedOutput, outputDecimals)} ${outputSymbol}. The fill above comes from simulating your exact router call and price limit.`
                        : `The full-input V4Quoter quote is unavailable: ${preview.quoteError} The bounded router simulation succeeded; its partial fill is shown above.`}
                    </p>
                    <p>
                      Simulated at block {preview.blockNumber.toString()}.
                      Network gas is additional.
                    </p>
                    <p className="mono wrap-value">
                      sqrtPriceLimitX96: {preview.limit.toString()}
                    </p>
                  </details>
                </div>
              )}
              {!account ? (
                <button
                  type="button"
                  className="primary"
                  disabled={Boolean(busy)}
                  onClick={() => void connect()}
                >
                  {busy || "Connect wallet to swap"}
                  <Icon name="arrow" />
                </button>
              ) : wrongChain ? (
                <button
                  type="button"
                  className="primary"
                  disabled={Boolean(busy)}
                  onClick={() => void switchChain()}
                >
                  {busy || `Switch to ${d.network.name}`}
                  <Icon name="arrow" />
                </button>
              ) : preview && !expired ? (
                <>
                  <button
                    type="button"
                    className="primary"
                    disabled={!canAct}
                    onClick={() => void action("swap")}
                  >
                    {busy || `Confirm ${buy ? "buy" : "sell"}`}
                    <Icon name="arrow" />
                  </button>
                  <button
                    type="button"
                    className="secondary full"
                    disabled={Boolean(busy)}
                    onClick={invalidate}
                  >
                    Edit swap
                  </button>
                </>
              ) : (
                <button type="submit" className="primary" disabled={!canAct}>
                  {busy ||
                    (stale
                      ? "Waiting for fresh pool data"
                      : needsApproval
                        ? "Approve BAND"
                        : expired
                          ? "Refresh swap preview"
                          : "Preview swap")}
                  <Icon name="arrow" />
                </button>
              )}
              {needsApproval && account && !wrongChain && (
                <p className="field-help">
                  Step 1 of 2: approve exactly{" "}
                  {units(parsedAmount, inputDecimals)} BAND for PoolSwapTest.
                  Then preview and confirm your sell.
                </p>
              )}
            </form>
            <p className="action-status" role="status">
              {status}
            </p>
            {actionError && (
              <p className="notice error" role="alert">
                {actionError}
              </p>
            )}
            {hash && (
              <a
                className="transaction-link"
                href={`${d.network.explorer}/tx/${hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction {short(hash)}
                <Icon name="external" />
              </a>
            )}
            <div className="swap-footnote">
              <Icon name="check" />
              <span>Swap simulated before confirmation</span>
            </div>
          </section>
        </div>
        <section
          className="how-section"
          id="how-it-works"
          aria-labelledby="how-title"
        >
          <div className="how-intro">
            <span className="eyebrow">A moving guardrail</span>
            <h2 id="how-title">
              One hour sets <br />
              the next one’s range.
            </h2>
            <p>
              The hook keeps swaps near the last completed UTC hour’s
              time-weighted average tick.
            </p>
          </div>
          <div className="how-step">
            <span className="step-number">01 / Observe</span>
            <h3>A fresh reference</h3>
            <p>
              The average tick becomes a price in both directions. Quiet hours
              still count; the first hour has no band.
            </p>
          </div>
          <div className="how-step">
            <span className="step-number">02 / Make room</span>
            <h3>80% to 120%</h3>
            <p>
              The BAND-per-ETH range runs about 20% below and above that
              reference. Both band edges are inclusive.
            </p>
          </div>
          <div className="how-step">
            <span className="step-number">03 / Keep moving</span>
            <h3>A way back in</h3>
            <p>
              If the price is outside, a swap that brings it strictly closer is
              allowed. This form stops one tick inside the edge.
            </p>
          </div>
        </section>
        <details className="deployment-details">
          <summary>
            Pool & deployment details
            <span>
              Verified interfaces · {d.network.name}
              <Icon name="external" />
            </span>
          </summary>
          <div className="details-grid">
            <div>
              <h3>Contracts</h3>
              {[
                ...d.contracts,
                { name: d.swapRouter.name, address: d.swapRouter.address },
                ...Object.entries(d.network.uniswapV4).map(
                  ([name, address]) => ({ name, address }),
                ),
              ].map((c) => (
                <a
                  key={c.name}
                  href={`${d.network.explorer}/address/${c.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{c.name}</span>
                  <span className="mono wrap-value">{c.address}</span>
                  <Icon name="external" />
                </a>
              ))}
            </div>
            <div>
              <h3>On-chain observations</h3>
              <dl>
                <div>
                  <dt>Average period</dt>
                  <dd>
                    {market?.band.active
                      ? new Date(Number(market.band.hour) * 3600000)
                          .toISOString()
                          .slice(0, 10) +
                        " · " +
                        hourLabel
                      : "Not yet available"}
                  </dd>
                </div>
                <div>
                  <dt>Current / last observed tick</dt>
                  <dd>
                    {market ? `${market.tick} / ${market.lastTick}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Average / lower / upper tick</dt>
                  <dd>
                    {market?.band.active
                      ? `${market.band.average} / ${market.band.lower} / ${market.band.upper}`
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Active liquidity</dt>
                  <dd className="wrap-value">
                    {market?.liquidity.toString() ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Tick spacing</dt>
                  <dd>{d.pool.tickSpacing}</dd>
                </div>
              </dl>
              <p className="field-help">
                Zero active liquidity at the opening price does not rule out a
                first buy: liquidity can sit below it. HourClosed is emitted by
                swaps; the band view also accounts for idle hours.
              </p>
              <span className="eyebrow">Pool ID</span>
              <p className="mono wrap-value">{service.poolId}</p>
              <span className="eyebrow">Attested source commit</span>
              <p className="mono wrap-value">{d.sourceCommit}</p>
              <a href="./imd-deployment.json">
                Open deployment manifest <Icon name="external" />
              </a>
              {d.network.faucets.map((url, i) => (
                <a href={url} key={url} target="_blank" rel="noreferrer">
                  Sepolia faucet {i + 1}
                  <Icon name="external" />
                </a>
              ))}
            </div>
          </div>
        </details>
      </main>
      <footer className="wrap">
        <span className="footer-brand">band.</span>
        <span>Fixed supply. No admin. A little room to move.</span>
        <span>
          Built on Uniswap v4 <span aria-hidden="true">↗</span>
        </span>
      </footer>
    </>
  );
}

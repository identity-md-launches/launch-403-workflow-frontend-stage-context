import { parseUnits } from "viem";

export type Band = {
  active: boolean;
  average: number;
  lower: number;
  upper: number;
  hour: bigint;
};
export const MIN_TICK = -887272;
export const MAX_TICK = 887272;

// Integer port of Uniswap v4-core TickMath.getSqrtPriceAtTick (MIT).
// Constants and rounding are identical to the pinned implementation; never encode prices using float math.
const factors = [
  0xfffcb933bd6fad37aa2d162d1a594001n,
  0xfff97272373d413259a46990580e213an,
  0xfff2e50f5f656932ef12357cf3c7fdccn,
  0xffe5caca7e10e4e61c3624eaa0941cd0n,
  0xffcb9843d60f6159c9db58835c926644n,
  0xff973b41fa98c081472e6896dfb254c0n,
  0xff2ea16466c96a3843ec78b326b52861n,
  0xfe5dee046a99a2a811c461f1969c3053n,
  0xfcbe86c7900a88aedcffc83b479aa3a4n,
  0xf987a7253ac413176f2b074cf7815e54n,
  0xf3392b0822b70005940c7a398e4b70f3n,
  0xe7159475a2c29b7443b29c7fa6e889d9n,
  0xd097f3bdfd2022b8845ad8f792aa5825n,
  0xa9f746462d870fdf8a65dc1f90e061e5n,
  0x70d869a156d2a1b890bb3df62baf32f7n,
  0x31be135f97d08fd981231505542fcfa6n,
  0x9aa508b5b7a84e1c677de54f3e99bc9n,
  0x5d6af8dedb81196699c329225ee604n,
  0x2216e584f5fa1ea926041bedfe98n,
  0x48a170391f7dc42444e8fa2n,
];
export function sqrtAtTick(tick: number): bigint {
  if (!Number.isInteger(tick) || tick < MIN_TICK || tick > MAX_TICK)
    throw new Error("Tick outside the pool range.");
  let ratio = 1n << 128n;
  const absolute = Math.abs(tick);
  factors.forEach((factor, index) => {
    if (absolute & (1 << index)) ratio = (ratio * factor) >> 128n;
  });
  if (tick > 0) ratio = ((1n << 256n) - 1n) / ratio;
  return (ratio + (1n << 32n) - 1n) >> 32n;
}
function sqrt(value: bigint): bigint {
  if (value < 0n) throw new Error("Negative square root.");
  if (value < 2n) return value;
  let x = value,
    y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + value / x) / 2n;
  }
  return x;
}
export function swapLimit(
  band: Band,
  current: bigint,
  buy: boolean,
  tolerance: string,
): bigint {
  let limit = buy ? sqrtAtTick(MIN_TICK) + 1n : sqrtAtTick(MAX_TICK) - 1n;
  if (band.active) {
    const insideTick = Math.max(
      MIN_TICK + 1,
      Math.min(MAX_TICK - 1, buy ? band.lower + 1 : band.upper - 1),
    );
    limit = sqrtAtTick(insideTick);
  } else if (tolerance === "band") {
    throw new Error(
      "The first hour has no band. Choose a maximum price movement before previewing.",
    );
  }
  if (tolerance !== "band") {
    const bps = Number(tolerance);
    if (![50, 100, 300].includes(bps))
      throw new Error("Choose a supported price movement limit.");
    const bounded = sqrt(
      (current * current * BigInt(buy ? 10000 - bps : 10000 + bps)) / 10000n,
    );
    limit = buy
      ? bounded > limit
        ? bounded
        : limit
      : bounded < limit
        ? bounded
        : limit;
  }
  if (buy ? limit >= current : limit <= current)
    throw new Error(
      "There is no room to swap in this direction within the price limit. Reverse direction or wait for the next band.",
    );
  return limit;
}
export function inputAmount(value: string, decimals: number): bigint {
  if (
    !/^(?:\d+)(?:\.\d*)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a positive amount with at most ${decimals} decimal places.`,
    );
  const amount = parseUnits(value, decimals);
  if (amount <= 0n || amount > (1n << 127n) - 1n)
    throw new Error(
      "Enter a positive amount within the pool’s supported range.",
    );
  return amount;
}
export function unpackDelta(
  delta: bigint,
  buy: boolean,
): { spent: bigint; received: bigint } {
  const a0 = BigInt.asIntN(128, delta >> 128n);
  const a1 = BigInt.asIntN(128, delta);
  return buy ? { spent: -a0, received: a1 } : { spent: -a1, received: a0 };
}
export const tickPrice = (
  tick: number,
  decimals: number,
  nativeDecimals: number,
) => Math.pow(1.0001, tick) * Math.pow(10, nativeDecimals - decimals);
export const poolPrice = (
  price: bigint,
  decimals: number,
  nativeDecimals: number,
) => (Number(price) / 2 ** 96) ** 2 * Math.pow(10, nativeDecimals - decimals);
export function displayNumber(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value !== 0 && (Math.abs(value) < 0.00001 || Math.abs(value) >= 1e9))
    return value.toExponential(4);
  return new Intl.NumberFormat("en-US", { maximumSignificantDigits: 6 }).format(
    value,
  );
}

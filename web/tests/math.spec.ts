import { test, expect } from "@playwright/test";
import { inputAmount, sqrtAtTick, swapLimit, unpackDelta } from "../src/math";

const band = { active: true, average: 0, lower: -2231, upper: 1823, hour: 10n };
test("TickMath matches independent endpoint and unit-tick vectors", () => {
  expect(sqrtAtTick(0)).toBe(79228162514264337593543950336n);
  expect(sqrtAtTick(-887272)).toBe(4295128739n);
  expect(sqrtAtTick(887272)).toBe(
    1461446703485210103287273052203988822378723970342n,
  );
  expect(sqrtAtTick(1)).toBe(79232123823359799118286999568n);
  expect(sqrtAtTick(-1)).toBe(79224201403219477170569942574n);
  expect(() => sqrtAtTick(887273)).toThrow();
});
test("limits stop one tick inside, preserve correction from outside, reject outward motion", () => {
  expect(swapLimit(band, sqrtAtTick(0), true, "band")).toBe(sqrtAtTick(-2230));
  expect(swapLimit(band, sqrtAtTick(0), false, "band")).toBe(sqrtAtTick(1822));
  expect(swapLimit(band, sqrtAtTick(-3000), false, "band")).toBe(
    sqrtAtTick(1822),
  );
  expect(swapLimit(band, sqrtAtTick(3000), true, "band")).toBe(
    sqrtAtTick(-2230),
  );
  expect(() => swapLimit(band, sqrtAtTick(-3000), true, "band")).toThrow(
    "no room",
  );
  expect(() => swapLimit(band, sqrtAtTick(3000), false, "band")).toThrow(
    "no room",
  );
});
test("inactive, stricter tolerance, core endpoints and exact input validation", () => {
  expect(() =>
    swapLimit({ ...band, active: false }, sqrtAtTick(0), true, "band"),
  ).toThrow("first hour");
  const buy = swapLimit(band, sqrtAtTick(0), true, "100");
  const sell = swapLimit(band, sqrtAtTick(0), false, "100");
  expect(buy > sqrtAtTick(-2230) && buy < sqrtAtTick(0)).toBeTruthy();
  expect(sell < sqrtAtTick(1822) && sell > sqrtAtTick(0)).toBeTruthy();
  expect(
    swapLimit({ ...band, lower: -889503 }, sqrtAtTick(-885000), true, "band"),
  ).toBe(sqrtAtTick(-887271));
  expect(inputAmount("1.000001", 6)).toBe(1000001n);
  for (const amount of ["-1", "0", "1e4", "Infinity", "0.0000001", "1,000"])
    expect(() => inputAmount(amount, 6)).toThrow();
});
test("packed balance deltas retain signs for both directions", () => {
  const pack = (a: bigint, b: bigint) =>
    BigInt.asIntN(
      256,
      (BigInt.asUintN(128, a) << 128n) | BigInt.asUintN(128, b),
    );
  expect(unpackDelta(pack(-123n, 99n), true)).toEqual({
    spent: 123n,
    received: 99n,
  });
  expect(unpackDelta(pack(99n, -123n), false)).toEqual({
    spent: 123n,
    received: 99n,
  });
});

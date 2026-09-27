import { readFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { resolve, relative } from "node:path";
import { keccak256, toBytes } from "viem";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const json = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
export const handoff = json("web/config/deployment.json");
export const network = json("web/config/network.json");
export const ui = json("web/config/interface.json");
export const canonical = (value) =>
  JSON.stringify(value, (_, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, v[k]]),
        )
      : v,
  );
export const abiHash = (abi) => keccak256(toBytes(canonical(abi))).slice(2);
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const walk = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = resolve(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
export const inventory = () =>
  walk(resolve(root, "dist"))
    .filter((p) => relative(resolve(root, "dist"), p) !== "imd-deployment.json")
    .map((p) => ({
      path: relative(resolve(root, "dist"), p).split("\\").join("/"),
      sha256: sha256(readFileSync(p)),
    }));

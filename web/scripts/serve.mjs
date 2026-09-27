// Validation-only static server. The shipped export needs no Node server.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { root } from "./shared.mjs";

const dir = resolve(root, "dist");
const port = Number(process.env.BAND_PREVIEW_PORT ?? 4173);
const mime = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    let path = decodeURIComponent(url.pathname).replace(
      /^\/preview\/band\//,
      "/",
    );
    if (path.endsWith("/")) path += "index.html";
    const file = resolve(dir, "." + path);
    if (!file.startsWith(dir + "/") || !(await stat(file)).isFile())
      throw new Error("Not found");
    res.writeHead(200, {
      "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`Static export ready at http://localhost:${port}/preview/band/`),
);
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

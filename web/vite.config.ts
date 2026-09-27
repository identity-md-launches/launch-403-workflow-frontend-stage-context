import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    {
      name: "runtime-manifest-in-dev",
      configureServer(server) {
        server.middlewares.use("/imd-deployment.json", (_req, res) => {
          try {
            res.setHeader("Content-Type", "application/json");
            res.end(
              readFileSync(
                new URL("../dist/imd-deployment.json", import.meta.url),
              ),
            );
          } catch {
            res.statusCode = 404;
            res.end(
              "Run npm run build to generate the runtime manifest first.",
            );
          }
        });
      },
    },
  ],
  build: { outDir: "../dist", emptyOutDir: true, sourcemap: false },
});

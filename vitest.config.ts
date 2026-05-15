import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config. The codebase uses the `@/*` path alias (mapped to `./src/*`
 * in tsconfig.json), and any test that transitively touches a file using
 * that alias needs vitest to resolve it the same way Next.js does. Without
 * this alias entry the `cli.test.ts` suite fails to import `./cli` because
 * `signer.ts` (a transitive dependency) imports `@/lib/okx/lock`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    // No DOM needed — these are pure-function tests against server-side code.
    environment: "node",
  },
});

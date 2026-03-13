import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["**/*.e2e.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});

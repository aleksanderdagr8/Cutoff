import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      // Next.js marker — empty stub so Server Component modules can unit-test.
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
    },
  },
});

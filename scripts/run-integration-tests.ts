import { runWithTestDatabase } from "./test-database";

runWithTestDatabase("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"]);

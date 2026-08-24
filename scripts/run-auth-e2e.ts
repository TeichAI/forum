import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { runWithTestDatabase } from "./test-database";

if (existsSync(".env.local")) loadEnvFile(".env.local");
runWithTestDatabase("npx", ["playwright", "test", "--config", "playwright.auth.config.ts"]);

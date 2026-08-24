import { spawnSync } from "node:child_process";

const defaultPort = process.env.TEST_POSTGRES_PORT ?? "5433";
export const testDatabaseUrl = process.env.TEST_DATABASE_URL
  ?? `postgresql://teich_test:teich_test@localhost:${defaultPort}/teich_forum_test?schema=public`;

function checkedDatabaseUrl() {
  const parsed = new URL(testDatabaseUrl);
  const databaseName = parsed.pathname.slice(1);
  if (!databaseName.includes("test")) {
    throw new Error(`Refusing destructive test setup for database '${databaseName}'. TEST_DATABASE_URL must name a test database.`);
  }
  return parsed;
}

type Environment = Record<string, string | undefined>;

function run(command: string, args: string[], env: Environment) {
  const result = spawnSync(command, args, { env: env as NodeJS.ProcessEnv, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

export function runWithTestDatabase(command: string, args: string[], extraEnv: Environment = {}) {
  checkedDatabaseUrl();
  const ownsContainer = !process.env.TEST_DATABASE_URL;
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl, ...extraEnv };
  try {
    if (ownsContainer) {
      run("docker", ["compose", "--profile", "test", "up", "-d", "--wait", "database-test"], env);
    }
    run("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"], env);
    run(command, args, env);
  } finally {
    if (ownsContainer && process.env.KEEP_TEST_DATABASE !== "1") {
      spawnSync("docker", ["compose", "--profile", "test", "stop", "database-test"], { env, stdio: "inherit" });
    }
  }
}

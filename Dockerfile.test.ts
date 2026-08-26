import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dockerfilePath = join(process.cwd(), "Dockerfile");
const composePath = join(process.cwd(), "compose.yaml");
const workflowPath = join(process.cwd(), ".github/workflows/verify.yml");

let dockerfile: string;
let compose: string;
let workflow: string;
let runnerStage: string;

beforeAll(async () => {
  [dockerfile, compose, workflow] = await Promise.all([
    readFile(dockerfilePath, "utf8"),
    readFile(composePath, "utf8"),
    readFile(workflowPath, "utf8"),
  ]);

  const runnerStageStart = dockerfile.indexOf("FROM base AS runner");
  expect(runnerStageStart).toBeGreaterThanOrEqual(0);
  runnerStage = dockerfile.slice(runnerStageStart);
});

describe("production Dockerfile", () => {
  it("makes the application URL and env file available to the Next.js build", () => {
    expect(compose).toMatch(
      /args:\s+NEXT_PUBLIC_APP_URL: http:\/\/localhost:\$\{FORUM_PORT:-3000\}\s+NEXT_PUBLIC_CLERK_ACCESS_MODE:/,
    );
    expect(compose).toMatch(/secrets:\s+- app_env/);
    expect(dockerfile).toContain(
      "RUN --mount=type=secret,id=app_env,target=/app/.env.local npm run build",
    );
  });

  it("uses the tracked example env when CI starts the test database", () => {
    expect(workflow).toMatch(/FORUM_ENV_FILE:\s*\.env\.example/);
  });

  it("includes the Prisma CLI and migration files in the runner image", () => {
    expect(dockerfile).toContain("RUN npm install --global prisma@6.12.0");
    expect(runnerStage).toContain(
      "COPY --from=migration-tools /usr/local/lib/node_modules /usr/local/lib/node_modules",
    );
    expect(runnerStage).toContain(
      "RUN ln -s ../lib/node_modules/prisma/build/index.js /usr/local/bin/prisma",
    );
    expect(runnerStage).toContain("COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma");
  });

  it("deploys migrations before starting the standalone server", () => {
    const commandMatch = runnerStage.match(/^CMD\s+(\[.*\])$/m);

    expect(commandMatch).not.toBeNull();
    const command = JSON.parse(commandMatch![1]) as string[];
    expect(command).toEqual([
      "sh",
      "-c",
      "prisma migrate deploy && exec node server.js",
    ]);

    const startupScript = command[2];
    expect(startupScript.indexOf("prisma migrate deploy")).toBeLessThan(
      startupScript.indexOf("node server.js"),
    );
    expect(startupScript).toContain("migrate deploy && exec node server.js");
  });

  it("runs migrations and the application as the non-root nextjs user", () => {
    const userDirective = runnerStage.indexOf("USER nextjs");
    const commandDirective = runnerStage.indexOf("CMD ");

    expect(userDirective).toBeGreaterThanOrEqual(0);
    expect(commandDirective).toBeGreaterThan(userDirective);
    expect(runnerStage.slice(userDirective, commandDirective)).not.toMatch(/^USER\s+root$/m);
  });
});

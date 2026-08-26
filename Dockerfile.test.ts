import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const dockerfilePath = join(process.cwd(), "Dockerfile");
const composePath = join(process.cwd(), "compose.yaml");
const exampleEnvPath = join(process.cwd(), ".env.example");
const workflowPath = join(process.cwd(), ".github/workflows/verify.yml");

let dockerfile: string;
let compose: string;
let exampleEnv: string;
let workflow: string;
let runnerStage: string;

beforeAll(async () => {
  [dockerfile, compose, exampleEnv, workflow] = await Promise.all([
    readFile(dockerfilePath, "utf8"),
    readFile(composePath, "utf8"),
    readFile(exampleEnvPath, "utf8"),
    readFile(workflowPath, "utf8"),
  ]);

  const runnerStageStart = dockerfile.indexOf("FROM base AS runner");
  expect(runnerStageStart).toBeGreaterThanOrEqual(0);
  runnerStage = dockerfile.slice(runnerStageStart);
});

describe("production Dockerfile", () => {
  it("uses only Railway-supported cache mounts and a plain Next.js build command", () => {
    const mountTypes = [...dockerfile.matchAll(/--mount=([^\s\\]+)/g)].map(
      ([, options]) =>
        options
          .split(",")
          .find((option) => option.startsWith("type="))
          ?.slice("type=".length) ?? "bind",
    );

    expect(mountTypes.filter((type) => type !== "cache")).toEqual([]);
    expect(dockerfile).toMatch(/^RUN npm run build$/m);
  });

  it("forwards public build variables without exposing private runtime secrets", () => {
    const publicBuildVariables = [...dockerfile.matchAll(/^ARG (NEXT_PUBLIC_[A-Z0-9_]+)/gm)]
      .map(([, variable]) => variable)
      .sort();
    const privateRuntimeVariables = exampleEnv
      .split("\n")
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((variable): variable is string => Boolean(variable))
      .filter((variable) => !variable.startsWith("NEXT_PUBLIC_"));
    const composeArgsBlock = compose.match(
      /^ {6}args:\n((?:^ {8}[A-Z][A-Z0-9_]*:.*(?:\n|$))+)/m,
    );

    expect(composeArgsBlock).not.toBeNull();
    const composeBuildArguments = [...composeArgsBlock![1].matchAll(/^ {8}([A-Z][A-Z0-9_]*):/gm)]
      .map(([, variable]) => variable)
      .sort();

    expect(composeBuildArguments).toEqual(publicBuildVariables);
    for (const variable of publicBuildVariables) {
      expect(composeArgsBlock![1]).toContain(`${variable}: \${${variable}}`);
    }
    for (const variable of privateRuntimeVariables) {
      expect(composeBuildArguments).not.toContain(variable);
    }
    expect(compose).toMatch(/env_file:\s+- \$\{FORUM_ENV_FILE:-\.env\.local\}/);
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

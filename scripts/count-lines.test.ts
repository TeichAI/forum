import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, "scripts", "count-lines.sh");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { force: true, recursive: true })));
});

describe("count-lines.sh", () => {
  it("runs cloc against the repository with generated and third-party files excluded", async () => {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), "teich-forum-cloc-"));
    temporaryDirectories.push(temporaryDirectory);

    const binDirectory = join(temporaryDirectory, "bin");
    const invocationFile = join(temporaryDirectory, "cloc-arguments.txt");
    const unrelatedWorkingDirectory = join(temporaryDirectory, "working-directory");
    const fakeCloc = join(binDirectory, "cloc");

    await mkdir(binDirectory);
    await mkdir(unrelatedWorkingDirectory);
    await writeFile(fakeCloc, '#!/bin/sh\nprintf "%s\\n" "$@" > "$CLOC_INVOCATION_FILE"\n');
    await chmod(fakeCloc, 0o755);

    const result = spawnSync("/bin/bash", [scriptPath], {
      cwd: unrelatedWorkingDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        CLOC_INVOCATION_FILE: invocationFile,
        PATH: `${binDirectory}${delimiter}${process.env.PATH ?? ""}`,
      },
    });

    expect(result.status, result.stderr).toBe(0);
    await expect(readFile(invocationFile, "utf8")).resolves.toBe(
      [
        "--exclude-dir=.git,node_modules,.next,out,dist,build,coverage,playwright-report,test-results,.auth-state,.turbo,.cache,generated",
        "--not-match-f=^(package-lock\\.json|npm-shrinkwrap\\.json|pnpm-lock\\.yaml|yarn\\.lock)$|\\.(min\\.(js|css)|map)$",
        repoRoot,
        "",
      ].join("\n"),
    );
  });
});

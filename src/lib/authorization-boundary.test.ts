import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sourceRoot = join(root, "src");

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "test" ? [] : productionSourceFiles(path);
    if (!/\.[cm]?[jt]sx?$/.test(entry.name) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

describe("Clerk authorization boundary", () => {
  it("keeps the committed session claim sourced only from public metadata", () => {
    const claims = JSON.parse(readFileSync(join(root, "config/clerk-session-claims.json"), "utf8"));

    expect(claims).toEqual({ forum_role: "{{user.public_metadata.role}}" });
    expect(JSON.stringify(claims)).not.toMatch(/unsafe[_-]?metadata/i);
  });

  it("rejects client-writable Clerk metadata from every production code path", () => {
    const offenders = productionSourceFiles(sourceRoot)
      .filter((path) => /unsafeMetadata|unsafe_metadata/.test(readFileSync(path, "utf8")))
      .map((path) => relative(root, path));

    expect(offenders, "Clerk unsafeMetadata is client-writable and cannot be a trusted application input").toEqual([]);
  });

  it("keeps every direct trusted role read in the reviewed authorization and synchronization modules", () => {
    const trustedRoleRead = /sessionClaims\?\.forum_role|publicMetadata\?\.role|public_metadata\?\.role/g;
    const reads = productionSourceFiles(sourceRoot).flatMap((path) => {
      const matches = readFileSync(path, "utf8").match(trustedRoleRead) ?? [];
      return matches.map((match) => `${relative(root, path)}:${match}`);
    });

    expect(reads.sort()).toEqual([
      "src/app/api/webhooks/clerk/route.ts:public_metadata?.role",
      "src/lib/auth.ts:publicMetadata?.role",
      "src/lib/auth.ts:publicMetadata?.role",
      "src/lib/auth.ts:sessionClaims?.forum_role",
    ]);
  });
});

import { existsSync, readFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { createClerkClient } from "@clerk/backend";
import { PrismaClient } from "@prisma/client";

export type GeneratedIdentity = {
  email: string;
  clerkUserIds: string[];
};

export const identityRecordPath = resolve(process.cwd(), ".auth-state/generated-users.json");

export function readIdentityRecord(): GeneratedIdentity | null {
  if (!existsSync(identityRecordPath)) return null;
  return JSON.parse(readFileSync(identityRecordPath, "utf8")) as GeneratedIdentity;
}

export async function cleanupIdentity(identity: GeneratedIdentity) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required to clean up Clerk E2E users.");

  const clerk = createClerkClient({ secretKey });
  const errors: string[] = [];
  const userIds = new Set(identity.clerkUserIds);

  try {
    const matches = await clerk.users.getUserList({ emailAddress: [identity.email], limit: 100 });
    matches.data.forEach((user) => userIds.add(user.id));
  } catch (error) {
    errors.push(`Clerk lookup: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (userIds.size > 0) {
    const prisma = new PrismaClient();
    try {
      await prisma.user.deleteMany({
        where: { OR: [{ clerkId: { in: [...userIds] } }, { email: identity.email }] },
      });
    } catch (error) {
      // A running Compose app may use the internal `database` hostname while
      // the host DATABASE_URL is intentionally unusable. Clean that same local
      // database through psql as a fallback.
      try {
        const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
        const ids = [...userIds].map(quote).join(", ");
        const sql = `DELETE FROM "User" WHERE "email" = ${quote(identity.email)} OR "clerkId" IN (${ids});`;
        execFileSync("docker", ["compose", "exec", "-T", "database", "psql", "-U", "teich", "-d", "teich_forum", "-v", "ON_ERROR_STOP=1", "-c", sql], { stdio: "pipe" });
      } catch (fallbackError) {
        errors.push(`local database cleanup: ${error instanceof Error ? error.message : String(error)}; Compose fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  for (const userId of userIds) {
    try {
      await clerk.users.deleteUser(userId);
    } catch (error) {
      if ((error as { status?: number }).status !== 404) {
        errors.push(`Clerk user ${userId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  if (errors.length) {
    throw new Error(`Authentication E2E cleanup was incomplete:\n${errors.join("\n")}`);
  }

  rmSync(dirname(identityRecordPath), { recursive: true, force: true });
}

import { expect, it } from "vitest";
import { provisionClerkUser } from "./user-provisioning";
import { db } from "./db";

it("allocates distinct deterministic usernames during concurrent provisioning", async () => {
  const [first, second] = await Promise.all([
    provisionClerkUser({ clerkId: "clerk_parallel_one", preferredUsername: "Pond Keeper", displayName: "First", role: "MEMBER" }),
    provisionClerkUser({ clerkId: "clerk_parallel_two", preferredUsername: "Pond Keeper", displayName: "Second", role: "MEMBER" }),
  ]);

  expect(new Set([first.username, second.username]).size).toBe(2);
  expect([first.username, second.username]).toContain("pond_keeper");
  expect(await db.user.count({ where: { clerkId: { in: ["clerk_parallel_one", "clerk_parallel_two"] } } })).toBe(2);
});

it("is idempotent when the same Clerk user is provisioned concurrently", async () => {
  const users = await Promise.all(Array.from({ length: 3 }, () => provisionClerkUser({
    clerkId: "clerk_same_user",
    preferredUsername: "Same Member",
    displayName: "Same Member",
    role: "MEMBER",
  })));

  expect(new Set(users.map((user) => user.id)).size).toBe(1);
  expect(await db.user.count({ where: { clerkId: "clerk_same_user" } })).toBe(1);
});

import { PrismaClient } from "@prisma/client";

export const featureIds = {
  member: "cm100000000000000000000001",
  other: "cm100000000000000000000002",
  admin: "cm100000000000000000000003",
  category: "cm100000000000000000000004",
  baselineThread: "cm100000000000000000000005",
};

export default async function featureGlobalSetup() {
  if (process.env.E2E_TEST_MODE !== "1" || !process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Feature E2E requires guarded test mode and a test database");
  }
  const db = new PrismaClient();
  await db.user.createMany({ data: [
    { id: featureIds.member, clerkId: "e2e_member", email: "member@example.test", username: "pond_member", displayName: "Pond Member" },
    { id: featureIds.other, clerkId: "e2e_other", email: "other@example.test", username: "pond_other", displayName: "Pond Other" },
    { id: featureIds.admin, clerkId: "e2e_admin", email: "admin@example.test", username: "pond_admin", displayName: "Pond Admin", role: "ADMIN" },
  ] });
  await db.category.create({ data: {
    id: featureIds.category, name: "General", slug: "general", description: "Ideas and community conversation.", position: 0,
  } });
  await db.thread.create({ data: {
    id: featureIds.baselineThread, slug: "welcome-to-the-test-pond", title: "Welcome to the test pond",
    body: "A searchable baseline discussion about healthy communities.", authorId: featureIds.member, categoryId: featureIds.category,
  } });
  await db.$disconnect();
}

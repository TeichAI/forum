import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const categories = [
  { name: "Announcements", slug: "announcements", description: "News and updates from the Teich project.", color: "#0f766e", icon: "megaphone", position: 0 },
  { name: "General", slug: "general", description: "Ideas, questions, and community conversation.", color: "#2563eb", icon: "messages-square", position: 1 },
  { name: "Building with Teich", slug: "building", description: "Share projects, integrations, experiments, and technical help.", color: "#7c3aed", icon: "blocks", position: 2 },
  { name: "Showcase", slug: "showcase", description: "Show the community what you have made.", color: "#c2410c", icon: "sparkles", position: 3 },
  { name: "Feedback", slug: "feedback", description: "Suggest improvements and help shape what comes next.", color: "#be185d", icon: "message-circle-heart", position: 4 },
];

async function main() {
  for (const category of categories) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: category,
      create: category,
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

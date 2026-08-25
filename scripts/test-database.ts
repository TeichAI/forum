import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

function verifyMailMigrationRecoversFromOrphanEnum(env: Environment) {
  const migrationName = "20260825180000_replace_messages_with_mail";
  const sourcePrismaDirectory = join(process.cwd(), "prisma");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "teich-mail-migration-"));
  const temporaryPrismaDirectory = join(temporaryRoot, "prisma");
  const temporaryMigrationsDirectory = join(temporaryPrismaDirectory, "migrations");

  try {
    mkdirSync(temporaryMigrationsDirectory, { recursive: true });
    cpSync(join(sourcePrismaDirectory, "schema.prisma"), join(temporaryPrismaDirectory, "schema.prisma"));
    cpSync(join(sourcePrismaDirectory, "migrations", "migration_lock.toml"), join(temporaryMigrationsDirectory, "migration_lock.toml"));

    for (const prerequisite of [
      "20260823220302_init",
      "20260824120000_reset_roles_for_clerk",
      "20260824180000_add_space_posting_policy",
      "20260824220000_staff_console",
      "20260825120000_application_rate_limits",
    ]) {
      cpSync(
        join(sourcePrismaDirectory, "migrations", prerequisite),
        join(temporaryMigrationsDirectory, prerequisite),
        { recursive: true },
      );
    }

    const orphanMigrationDirectory = join(temporaryMigrationsDirectory, "20260825170000_test_orphan_mail_location");
    mkdirSync(orphanMigrationDirectory);
    writeFileSync(
      join(orphanMigrationDirectory, "migration.sql"),
      `CREATE TYPE "MailLocation" AS ENUM ('INBOX', 'ARCHIVE', 'TRASH');\n`,
    );

    const temporarySchema = join(temporaryPrismaDirectory, "schema.prisma");
    run("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed", "--skip-generate", "--schema", temporarySchema], env);

    cpSync(
      join(sourcePrismaDirectory, "migrations", migrationName),
      join(temporaryMigrationsDirectory, migrationName),
      { recursive: true },
    );
    run("npx", ["prisma", "migrate", "deploy", "--schema", temporarySchema], env);
    run("npx", ["prisma", "migrate", "status", "--schema", temporarySchema], env);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

export function runWithTestDatabase(command: string, args: string[], extraEnv: Environment = {}) {
  checkedDatabaseUrl();
  const ownsContainer = !process.env.TEST_DATABASE_URL;
  const env = { ...process.env, DATABASE_URL: testDatabaseUrl, ...extraEnv };
  try {
    if (ownsContainer) {
      run("docker", ["compose", "--profile", "test", "up", "-d", "--wait", "database-test"], env);
    }
    verifyMailMigrationRecoversFromOrphanEnum(env);
    run("npx", ["prisma", "migrate", "reset", "--force", "--skip-seed"], env);
    run(command, args, env);
  } finally {
    if (ownsContainer && process.env.KEEP_TEST_DATABASE !== "1") {
      spawnSync("docker", ["compose", "--profile", "test", "stop", "database-test"], { env, stdio: "inherit" });
    }
  }
}

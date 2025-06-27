import dotEnv from "dotenv";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

import { isPrismaAvailableCheck } from "./is-prisma-available-check";

dotEnv.config({ path: "../../.env" });

const exec = promisify(execCb);

/**
 * TODO: re-write this when Prisma.io gets a programmatic migration API
 * Thanks to @olalonde for the idea.
 * @see https://github.com/prisma/prisma/issues/4703#issuecomment-1447354363
 */
async function main(): Promise<void> {
  console.log("Checking SKIP_DB_MIGRATIONS...");
  if (process.env.SKIP_DB_MIGRATIONS === "1") {
    console.info("SKIP_DB_MIGRATIONS set, skipping migrations");
    return;
  }
  console.log("Checking DATABASE_URL...");
  if (!process.env.DATABASE_URL) {
    console.info("No DATABASE_URL found, skipping migrations");
    return;
  }
  console.log("Checking DATABASE_DIRECT_URL...");
  if (!process.env.DATABASE_DIRECT_URL) {
    console.info("No DATABASE_DIRECT_URL found, skipping migrations");
    return;
  }
  console.log("Checking Prisma availability...");
  if (!(await isPrismaAvailableCheck())) {
    console.info("Prisma can't be initialized, skipping migrations");
    return;
  }
  console.log("Running yarn prisma migrate deploy...");
  // throws an error if migration fails
  const { stdout, stderr } = await exec("yarn prisma migrate deploy", {
    env: {
      ...process.env,
    },
  });
  console.log("Migrate deploy stdout:", stdout);
  console.error("Migrate deploy stderr:", stderr);
}

main().catch((e) => {
  console.error(e.stdout || e.stderr || e.message);
  process.exit(1);
});

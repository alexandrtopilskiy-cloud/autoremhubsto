import { loadEnvConfig } from "@next/env";
import { beforeEach } from "vitest";

loadEnvConfig(process.cwd());
if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL не задан");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

beforeEach(async () => {
  const { prisma } = await import("@/lib/db");
  // Удаление компаний каскадом чистит все рабочие данные.
  await prisma.$transaction([prisma.company.deleteMany(), prisma.user.deleteMany()]);
});

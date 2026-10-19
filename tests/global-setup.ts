import { execSync } from "node:child_process";
import { loadEnvConfig } from "@next/env";

// Перед прогоном накатываем миграции на тестовую базу.
export default function setup() {
  loadEnvConfig(process.cwd());
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL не задан");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}

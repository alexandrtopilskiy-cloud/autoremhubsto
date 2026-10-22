import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import { versionFromDates } from "./src/lib/version";

/** Версия считается при сборке по датам вливаний в main (git log первого родителя). */
function appVersion(): string {
  if (process.env.APP_VERSION) return process.env.APP_VERSION;
  try {
    const out = execSync("git log --first-parent --format=%cI HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    return versionFromDates(out.split("\n").filter(Boolean));
  } catch {
    return "dev";
  }
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs"],
  // вложения: до 10 МБ на файл у документов, до 30 МБ у сканов сотрудника; за раз можно загрузить несколько файлов
  experimental: { serverActions: { bodySizeLimit: "100mb" } },
  env: { NEXT_PUBLIC_APP_VERSION: appVersion() },
};

export default nextConfig;

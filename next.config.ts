import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "bcryptjs", "exceljs"],
  // вложения к документам — до 10 МБ на файл
  experimental: { serverActions: { bodySizeLimit: "11mb" } },
};

export default nextConfig;

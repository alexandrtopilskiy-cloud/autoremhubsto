import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { parsePermissions, PRESETS, type Permissions } from "./permissions";
import { roleLabel } from "./roles";

export const SESSION_COOKIE = "sto_session";
const SESSION_DAYS = 30;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function digest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Создаёт сессию и возвращает токен для cookie. В базе хранится только его хэш. */
export async function createSession(userId: string, companyId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);
  await prisma.session.create({ data: { id: digest(token), userId, companyId, expiresAt } });
  return { token, expiresAt };
}

export type SessionCtx = {
  userId: string;
  userName: string;
  companyId: string;
  companyName: string;
  role: Role;
  /** Название роли для шапки: своя роль СТО или встроенная. */
  roleName: string;
  perms: Permissions;
};

export async function resolveSession(token: string | undefined): Promise<SessionCtx | null> {
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { id: digest(token) },
    include: { user: true },
  });
  if (!s) return null;
  if (s.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: s.id } }).catch(() => {});
    return null;
  }
  // Доступ к компании мог быть отозван после входа.
  const m = await prisma.membership.findUnique({
    where: { userId_companyId: { userId: s.userId, companyId: s.companyId } },
    include: { company: true, customRole: true },
  });
  if (!m) return null;
  const custom = m.role !== "OWNER" ? m.customRole : null;
  return {
    userId: s.userId,
    userName: s.user.name,
    companyId: s.companyId,
    companyName: m.company.name,
    role: m.role,
    roleName: custom?.name ?? roleLabel(m.role),
    perms: custom ? parsePermissions(custom.permissions) : PRESETS[m.role],
  };
}

export async function destroySession(token: string | undefined): Promise<void> {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: digest(token) } });
}

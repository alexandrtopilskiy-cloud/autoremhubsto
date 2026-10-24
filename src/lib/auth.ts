import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_COOKIE, destroySession, resolveSession, type SessionCtx } from "./auth-core";

export { createSession } from "./auth-core";
export type { SessionCtx } from "./auth-core";


export async function setSessionCookie(token: string, expiresAt: Date) {
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

/** Сессия текущего запроса: рамка кабинета и страница проверяют её один раз на двоих. */
export const currentSession = cache(async (): Promise<SessionCtx | null> => {
  return resolveSession((await cookies()).get(SESSION_COOKIE)?.value);
});

/** Для страниц и действий внутри кабинета: без сессии — на вход. */
export async function requireSession(): Promise<SessionCtx> {
  const s = await currentSession();
  if (!s) redirect("/login");
  return s;
}

export async function logout() {
  const jar = await cookies();
  await destroySession(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

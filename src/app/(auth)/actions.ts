"use server";

import { redirect } from "next/navigation";
import { createSession, setSessionCookie } from "@/lib/auth";
import { fields, run, type FormState } from "@/lib/actions";
import { authenticate, registerCompany } from "@/lib/services/accounts";

export async function registerAction(_: FormState, fd: FormData): Promise<FormState> {
  let ids: { userId: string; companyId: string } | undefined;
  const res = await run(async () => {
    const { user, company } = await registerCompany(fields(fd));
    ids = { userId: user.id, companyId: company.id };
  });
  if (!ids) return res;
  const s = await createSession(ids.userId, ids.companyId);
  await setSessionCookie(s.token, s.expiresAt);
  redirect("/app");
}

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  let ids: { userId: string; companyId: string } | undefined;
  const res = await run(async () => {
    ids = await authenticate(fields(fd));
  });
  if (!ids) return res;
  const s = await createSession(ids.userId, ids.companyId);
  await setSessionCookie(s.token, s.expiresAt);
  redirect("/app");
}

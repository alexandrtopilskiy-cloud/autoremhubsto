"use server";

import { notFound, redirect } from "next/navigation";
import { fields, run, type FormState } from "@/lib/actions";
import { prisma } from "@/lib/db";
import { isLocalRuntime } from "@/lib/local-runtime";
import { pairLocalCabinet, setupLocalCabinet } from "@/lib/services/local-cabinet";

async function requireEmptyLocal() {
  if (!isLocalRuntime()) notFound();
  if (await prisma.company.findFirst({ select: { id: true } })) redirect("/login");
}

export async function localPairAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireEmptyLocal();
  return run(async () => {
    await pairLocalCabinet(String(fd.get("pairingCode") ?? ""));
  });
}

export async function localSetupAction(_: FormState, fd: FormData): Promise<FormState> {
  await requireEmptyLocal();
  let result: Awaited<ReturnType<typeof setupLocalCabinet>> | undefined;
  const state = await run(async () => { result = await setupLocalCabinet(fields(fd)); });
  if (!result) return state;
  redirect(`/login?local-ready=${result.confirmed ? "1" : "unconfirmed"}`);
}

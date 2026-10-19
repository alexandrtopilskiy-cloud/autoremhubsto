"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { EstimateStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { fields, num, rub, run, type FormState } from "@/lib/actions";
import {
  addEstimateLine,
  addEstimateLineFromCatalog,
  createEstimate,
  estimateToOrder,
  removeEstimateLine,
  setEstimateStatus,
  updateEstimate,
} from "@/lib/services/estimates";

export async function createEstimateAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    id = (await createEstimate(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/estimates/${id}`);
}

async function onEstimate(id: string, fn: (companyId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(() => fn(s.companyId));
  revalidatePath(`/app/estimates/${id}`);
  return res;
}

export async function updateEstimateAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c) => updateEstimate(c, id, fields(fd)));
}

export async function addEstimateLineAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c) => addEstimateLine(c, id, { ...fields(fd), qty: num(fd, "qty"), price: rub(fd, "price", "Цена") }));
}

export async function addEstimateCatalogAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c) => addEstimateLineFromCatalog(c, id, { ...fields(fd), qty: num(fd, "qty") }));
}

export async function removeEstimateLineAction(id: string, lineId: string) {
  return onEstimate(id, (c) => removeEstimateLine(c, id, lineId));
}

export async function setEstimateStatusAction(id: string, status: EstimateStatus) {
  return onEstimate(id, (c) => setEstimateStatus(c, id, status));
}

export async function estimateToOrderAction(id: string): Promise<FormState> {
  const s = await requireSession();
  let orderId: string | undefined;
  const res = await run(async () => {
    orderId = (await estimateToOrder(s.companyId, id)).id;
  });
  if (!orderId) return res;
  redirect(`/app/orders/${orderId}`);
}

"use server";

import { redirect } from "next/navigation";
import type { EstimateStatus } from "@prisma/client";
import { requireSession, type SessionCtx } from "@/lib/auth";
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
import { guarded } from "@/lib/guard";
import { assertCan, assertFlag, checkDiscount } from "@/lib/permissions";

export async function createEstimateAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "orders", "CREATE");
    id = (await createEstimate(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/estimates/${id}`);
}

async function onEstimate(id: string, fn: (companyId: string, s: SessionCtx) => Promise<unknown>): Promise<FormState> {
  return guarded("orders", "EDIT", `/app/estimates/${id}`, fn);
}

export async function updateEstimateAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c) => updateEstimate(c, id, fields(fd)));
}

export async function addEstimateLineAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c, s) => {
    assertFlag(s.perms, "prices");
    checkDiscount(s.perms, fd.get("discount"));
    return addEstimateLine(c, id, { ...fields(fd), qty: num(fd, "qty"), price: rub(fd, "price", "Цена") });
  });
}

export async function addEstimateCatalogAction(id: string, _: FormState, fd: FormData) {
  return onEstimate(id, (c, s) => {
    checkDiscount(s.perms, fd.get("discount"));
    return addEstimateLineFromCatalog(c, id, { ...fields(fd), qty: num(fd, "qty") });
  });
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
    assertCan(s.perms, "orders", "CREATE");
    orderId = (await estimateToOrder(s.companyId, id)).id;
  });
  if (!orderId) return res;
  redirect(`/app/orders/${orderId}`);
}

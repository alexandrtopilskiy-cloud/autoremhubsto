"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { LineKind, OrderStage, RecommendationStatus } from "@prisma/client";
import { requireSession } from "@/lib/auth";
import { fields, num, rub, run, type FormState } from "@/lib/actions";
import {
  addItem,
  addItemFromCatalog,
  addWorkFromCatalog,
  addPayment,
  addWork,
  createOrder,
  postOrder,
  removeItem,
  removeWork,
  setStage,
  unpostOrder,
  updateOrderHeader,
} from "@/lib/services/orders";
import { cancelRequest, issueRequest, removeRequestLine, requestPart } from "@/lib/services/parts-requests";
import {
  addRecommendation,
  lineToRecommendation,
  recommendationToOrder,
  setRecommendationStatus,
} from "@/lib/services/recommendations";
import { assertOperator } from "@/lib/roles";

export async function createOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    id = (await createOrder(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/orders/${id}`);
}

async function onOrder(orderId: string, fn: (companyId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(() => fn(s.companyId));
  revalidatePath(`/app/orders/${orderId}`);
  return res;
}

export async function updateHeaderAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => updateOrderHeader(c, orderId, fields(fd)));
}

export async function addWorkAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) =>
    addWork(c, orderId, { ...fields(fd), normHours: num(fd, "normHours"), price: rub(fd, "price", "Цена") }),
  );
}

export async function addItemAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) =>
    addItem(c, orderId, { ...fields(fd), qty: num(fd, "qty"), price: rub(fd, "price", "Цена") }),
  );
}

export async function addPaymentAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => {
    const amount = rub(fd, "amount");
    const refund = fd.get("refund") === "1";
    return addPayment(c, orderId, {
      amount: refund ? -Math.abs(amount) : amount,
      method: fields(fd).method as "CASH",
      cashboxId: fields(fd).cashboxId,
      comment: fields(fd).comment,
    });
  });
}

export async function removeWorkAction(orderId: string, lineId: string) {
  return onOrder(orderId, (c) => removeWork(c, orderId, lineId));
}

export async function removeItemAction(orderId: string, lineId: string) {
  return onOrder(orderId, (c) => removeItem(c, orderId, lineId));
}

export async function setStageAction(orderId: string, stage: OrderStage) {
  return onOrder(orderId, (c) => setStage(c, orderId, stage));
}

export async function postAction(orderId: string) {
  return onOrder(orderId, (c) => postOrder(c, orderId));
}

export async function unpostAction(orderId: string) {
  return onOrder(orderId, (c) => unpostOrder(c, orderId));
}

export async function addWorkFromCatalogAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => addWorkFromCatalog(c, orderId, { ...fields(fd), qty: num(fd, "qty") }));
}

export async function addItemFromCatalogAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => addItemFromCatalog(c, orderId, { ...fields(fd), qty: num(fd, "qty") }));
}

// --- рекомендации ---

export async function addRecommendationAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) =>
    addRecommendation(c, orderId, { ...fields(fd), qty: num(fd, "qty"), price: fd.get("price") ? rub(fd, "price", "Цена") : 0 }),
  );
}

export async function lineToRecommendationAction(orderId: string, kind: LineKind, lineId: string) {
  return onOrder(orderId, (c) => lineToRecommendation(c, orderId, kind, lineId));
}

export async function recommendationToOrderAction(orderId: string, recId: string) {
  return onOrder(orderId, (c) => recommendationToOrder(c, recId, orderId));
}

export async function setRecommendationStatusAction(orderId: string, recId: string, status: RecommendationStatus) {
  return onOrder(orderId, (c) => setRecommendationStatus(c, recId, status));
}

// --- требования на запчасти ---

export async function requestPartAction(orderId: string, _: FormState, fd: FormData) {
  const s = await requireSession();
  return onOrder(orderId, (c) => requestPart(c, orderId, s.userId, { ...fields(fd), qty: num(fd, "qty") }));
}

export async function removeRequestLineAction(orderId: string, requestId: string, lineId: string) {
  return onOrder(orderId, (c) => removeRequestLine(c, requestId, lineId));
}

export async function issueRequestAction(orderId: string, requestId: string) {
  const s = await requireSession();
  return onOrder(orderId, (c) => {
    assertOperator(s.role);
    return issueRequest(c, requestId);
  });
}

export async function cancelRequestAction(orderId: string, requestId: string) {
  const s = await requireSession();
  return onOrder(orderId, (c) => {
    assertOperator(s.role);
    return cancelRequest(c, requestId);
  });
}

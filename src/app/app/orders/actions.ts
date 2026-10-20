"use server";

import { redirect } from "next/navigation";
import type { LineKind, OrderStage, RecommendationStatus } from "@prisma/client";
import { requireSession, type SessionCtx } from "@/lib/auth";
import { fields, num, rub, run, type FormState } from "@/lib/actions";
import { guarded } from "@/lib/guard";
import { resolveProductId } from "@/lib/services/catalog";
import { assertCan, assertFlag, checkDiscount, type Level, type Section } from "@/lib/permissions";
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
import { addDamage, removeDamage, saveInspection } from "@/lib/services/inspections";

export async function createOrderAction(_: FormState, fd: FormData): Promise<FormState> {
  const s = await requireSession();
  let id: string | undefined;
  const res = await run(async () => {
    assertCan(s.perms, "orders", "CREATE");
    id = (await createOrder(s.companyId, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/orders/${id}`);
}

/** Действие над заказ-нарядом: по умолчанию нужна правка заказ-нарядов. */
async function onOrder(
  orderId: string,
  fn: (companyId: string, s: SessionCtx) => Promise<unknown>,
  level: Level = "EDIT",
  section: Section = "orders",
): Promise<FormState> {
  return guarded(section, level, `/app/orders/${orderId}`, fn);
}

export async function updateHeaderAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => updateOrderHeader(c, orderId, fields(fd)));
}

export async function addWorkAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c, s) => {
    assertFlag(s.perms, "prices");
    checkDiscount(s.perms, fd.get("discount"));
    return addWork(c, orderId, { ...fields(fd), normHours: num(fd, "normHours"), price: rub(fd, "price", "Цена") });
  });
}

export async function addItemAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c, s) => {
    assertFlag(s.perms, "prices");
    checkDiscount(s.perms, fd.get("discount"));
    return addItem(c, orderId, { ...fields(fd), qty: num(fd, "qty"), price: rub(fd, "price", "Цена") });
  });
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
  }, "CREATE", "cash");
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
  return onOrder(orderId, (c) => postOrder(c, orderId), "FULL");
}

export async function unpostAction(orderId: string) {
  return onOrder(orderId, (c) => unpostOrder(c, orderId), "FULL");
}

export async function addWorkFromCatalogAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c, s) => {
    checkDiscount(s.perms, fd.get("discount"));
    return addWorkFromCatalog(c, orderId, { ...fields(fd), qty: num(fd, "qty") });
  });
}

export async function addItemFromCatalogAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, async (c, s) => {
    checkDiscount(s.perms, fd.get("discount"));
    const f = fields(fd);
    return addItemFromCatalog(c, orderId, { ...f, refId: await resolveProductId(c, { productId: f.refId, barcode: f.barcode }), qty: num(fd, "qty") });
  });
}

// --- рекомендации ---

export async function addRecommendationAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c, s) => {
    if (fd.get("price")) assertFlag(s.perms, "prices");
    return addRecommendation(c, orderId, { ...fields(fd), qty: num(fd, "qty"), price: fd.get("price") ? rub(fd, "price", "Цена") : 0 });
  });
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
  return onOrder(orderId, (c, s) => requestPart(c, orderId, s.userId, { ...fields(fd), qty: num(fd, "qty") }));
}

export async function removeRequestLineAction(orderId: string, requestId: string, lineId: string) {
  return onOrder(orderId, (c) => removeRequestLine(c, requestId, lineId));
}

export async function issueRequestAction(orderId: string, requestId: string) {
  return onOrder(orderId, (c) => issueRequest(c, requestId), "EDIT", "stock");
}

export async function cancelRequestAction(orderId: string, requestId: string) {
  return onOrder(orderId, (c) => cancelRequest(c, requestId), "EDIT", "stock");
}

// --- акт осмотра ---

export async function saveInspectionAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) =>
    saveInspection(c, orderId, {
      fuel: fields(fd).fuel,
      items: fd.getAll("items").map(String),
      dirty: fd.get("dirty") === "on",
      dark: fd.get("dark") === "on",
      notes: fields(fd).notes,
    }),
  );
}

export async function addDamageAction(orderId: string, _: FormState, fd: FormData) {
  return onOrder(orderId, (c) => addDamage(c, orderId, fields(fd)));
}

export async function removeDamageAction(orderId: string, index: number) {
  return onOrder(orderId, (c) => removeDamage(c, orderId, index));
}

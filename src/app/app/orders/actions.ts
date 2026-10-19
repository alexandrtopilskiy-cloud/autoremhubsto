"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { OrderStage } from "@prisma/client";
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

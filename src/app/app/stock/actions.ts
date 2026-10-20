"use server";

import { redirect } from "next/navigation";
import type { SessionCtx } from "@/lib/auth";
import { fields, num, rub, type FormState } from "@/lib/actions";
import { guarded } from "@/lib/guard";
import { resolveProductId } from "@/lib/services/catalog";
import { assertFlag, type Level } from "@/lib/permissions";
import {
  addReceiptLine,
  createReceipt,
  createSupplier,
  postReceipt,
  removeReceiptLine,
  unpostReceipt,
  updateReceipt,
  updateSupplier,
} from "@/lib/services/stock";
import { cancelRequest, issueRequest } from "@/lib/services/parts-requests";

/** Действие склада; costs — документ показывает закупочные цены. */
async function op(
  path: string,
  fn: (companyId: string, s: SessionCtx) => Promise<unknown>,
  level: Level = "EDIT",
  costs = false,
): Promise<FormState> {
  return guarded("stock", level, path, async (c, s) => {
    if (costs) assertFlag(s.perms, "costs");
    await fn(c, s);
  });
}

export async function createSupplierAction(_: FormState, fd: FormData) {
  return op("/app/stock/suppliers", (c) => createSupplier(c, fields(fd)), "CREATE");
}
export async function updateSupplierAction(id: string, _: FormState, fd: FormData) {
  return op("/app/stock/suppliers", (c) => updateSupplier(c, id, fields(fd)));
}

export async function createReceiptAction(_: FormState, fd: FormData): Promise<FormState> {
  let id: string | undefined;
  const res = await op("/app/stock/receipts", async (c) => {
    id = (await createReceipt(c, fields(fd))).id;
  }, "CREATE", true);
  if (!id) return res;
  redirect(`/app/stock/receipts/${id}`);
}

const rp = (id: string) => `/app/stock/receipts/${id}`;

export async function updateReceiptAction(id: string, _: FormState, fd: FormData) {
  return op(rp(id), (c) => updateReceipt(c, id, fields(fd)), "EDIT", true);
}
export async function addReceiptLineAction(id: string, _: FormState, fd: FormData) {
  return op(rp(id), async (c) =>
    addReceiptLine(c, id, { productId: await resolveProductId(c, fields(fd)), qty: num(fd, "qty"), cost: rub(fd, "cost", "Закупочная цена") }),
    "EDIT", true,
  );
}
export async function removeReceiptLineAction(id: string, lineId: string) {
  return op(rp(id), (c) => removeReceiptLine(c, id, lineId), "EDIT", true);
}
export async function postReceiptAction(id: string) {
  return op(rp(id), (c) => postReceipt(c, id), "FULL", true);
}
export async function unpostReceiptAction(id: string) {
  return op(rp(id), (c) => unpostReceipt(c, id), "FULL", true);
}

export async function issueRequestAction(id: string) {
  return op("/app/stock/requests", (c) => issueRequest(c, id));
}

export async function cancelRequestAction(id: string) {
  return op("/app/stock/requests", (c) => cancelRequest(c, id), "FULL");
}

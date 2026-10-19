"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { fields, num, rub, run, type FormState } from "@/lib/actions";
import { assertOperator } from "@/lib/roles";
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

async function op(path: string, fn: (companyId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    assertOperator(s.role);
    await fn(s.companyId);
  });
  revalidatePath(path);
  return res;
}

export async function createSupplierAction(_: FormState, fd: FormData) {
  return op("/app/stock/suppliers", (c) => createSupplier(c, fields(fd)));
}
export async function updateSupplierAction(id: string, _: FormState, fd: FormData) {
  return op("/app/stock/suppliers", (c) => updateSupplier(c, id, fields(fd)));
}

export async function createReceiptAction(_: FormState, fd: FormData): Promise<FormState> {
  let id: string | undefined;
  const res = await op("/app/stock/receipts", async (c) => {
    id = (await createReceipt(c, fields(fd))).id;
  });
  if (!id) return res;
  redirect(`/app/stock/receipts/${id}`);
}

const rp = (id: string) => `/app/stock/receipts/${id}`;

export async function updateReceiptAction(id: string, _: FormState, fd: FormData) {
  return op(rp(id), (c) => updateReceipt(c, id, fields(fd)));
}
export async function addReceiptLineAction(id: string, _: FormState, fd: FormData) {
  return op(rp(id), (c) =>
    addReceiptLine(c, id, { productId: fields(fd).productId, qty: num(fd, "qty"), cost: rub(fd, "cost", "Закупочная цена") }),
  );
}
export async function removeReceiptLineAction(id: string, lineId: string) {
  return op(rp(id), (c) => removeReceiptLine(c, id, lineId));
}
export async function postReceiptAction(id: string) {
  return op(rp(id), (c) => postReceipt(c, id));
}
export async function unpostReceiptAction(id: string) {
  return op(rp(id), (c) => unpostReceipt(c, id));
}

export async function issueRequestAction(id: string) {
  return op("/app/stock/requests", (c) => issueRequest(c, id));
}

export async function cancelRequestAction(id: string) {
  return op("/app/stock/requests", (c) => cancelRequest(c, id));
}

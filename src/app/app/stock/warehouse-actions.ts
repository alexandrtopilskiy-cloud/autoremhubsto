"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { fields, num, rub, run, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { assertOperator } from "@/lib/roles";
import {
  addSupplierOrderLine,
  cancelSupplierOrder,
  createSupplierOrder,
  receiveSupplierOrder,
  removeSupplierOrderLine,
  reopenSupplierOrder,
  sendSupplierOrder,
  updateSupplierOrder,
} from "@/lib/services/supplier-orders";
import {
  addInventoryLine,
  addSaleLine,
  addSalePayment,
  addWriteOffLine,
  createInventory,
  createSale,
  createWriteOff,
  postInventory,
  postSale,
  postWriteOff,
  removeInventoryLine,
  removeSaleLine,
  removeWriteOffLine,
  saveInventoryCounts,
  unpostInventory,
  unpostSale,
  unpostWriteOff,
  updateInventoryComment,
  updateSale,
  updateWriteOff,
} from "@/lib/services/warehouse";

async function op(path: string, fn: (companyId: string) => Promise<unknown>): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    assertOperator(s.role);
    await fn(s.companyId);
  });
  revalidatePath(path);
  return res;
}

/** Создаёт документ и открывает его. */
async function create(list: string, fn: (companyId: string) => Promise<{ id: string }>): Promise<FormState> {
  let id: string | undefined;
  const res = await op(list, async (c) => {
    id = (await fn(c)).id;
  });
  if (!id) return res;
  redirect(`${list}/${id}`);
}

/** Пустое поле цены — взять из справочника. */
const optRub = (fd: FormData, name: string, label: string) => (fd.get(name)?.toString().trim() ? rub(fd, name, label) : undefined);

// --- реализация ---

const sp = (id: string) => `/app/stock/sales/${id}`;

export async function createSaleAction(_: FormState, fd: FormData) {
  return create("/app/stock/sales", (c) => createSale(c, fields(fd)));
}
export async function updateSaleAction(id: string, _: FormState, fd: FormData) {
  return op(sp(id), (c) => updateSale(c, id, fields(fd)));
}
export async function addSaleLineAction(id: string, _: FormState, fd: FormData) {
  return op(sp(id), (c) =>
    addSaleLine(c, id, {
      productId: fields(fd).productId,
      qty: num(fd, "qty"),
      price: optRub(fd, "price", "Цена"),
      discount: num(fd, "discount"),
    }),
  );
}
export async function removeSaleLineAction(id: string, lineId: string) {
  return op(sp(id), (c) => removeSaleLine(c, id, lineId));
}
export async function postSaleAction(id: string) {
  return op(sp(id), (c) => postSale(c, id));
}
export async function unpostSaleAction(id: string) {
  return op(sp(id), (c) => unpostSale(c, id));
}
export async function addSalePaymentAction(id: string, _: FormState, fd: FormData) {
  return op(sp(id), (c) => {
    const amount = rub(fd, "amount");
    return addSalePayment(c, id, {
      cashboxId: fields(fd).cashboxId,
      amount: fd.get("refund") ? -amount : amount,
    });
  });
}

// --- заказы поставщикам ---

const op_ = (id: string) => `/app/stock/orders/${id}`;

export async function createSupplierOrderAction(_: FormState, fd: FormData) {
  return create("/app/stock/orders", (c) => createSupplierOrder(c, fields(fd)));
}
export async function updateSupplierOrderAction(id: string, _: FormState, fd: FormData) {
  return op(op_(id), (c) => updateSupplierOrder(c, id, fields(fd)));
}
export async function addSupplierOrderLineAction(id: string, _: FormState, fd: FormData) {
  return op(op_(id), (c) =>
    addSupplierOrderLine(c, id, {
      productId: fields(fd).productId,
      qty: num(fd, "qty"),
      cost: optRub(fd, "cost", "Цена"),
    }),
  );
}
export async function removeSupplierOrderLineAction(id: string, lineId: string) {
  return op(op_(id), (c) => removeSupplierOrderLine(c, id, lineId));
}
export async function sendSupplierOrderAction(id: string) {
  return op(op_(id), (c) => sendSupplierOrder(c, id));
}
export async function reopenSupplierOrderAction(id: string) {
  return op(op_(id), (c) => reopenSupplierOrder(c, id));
}
export async function cancelSupplierOrderAction(id: string) {
  return op(op_(id), (c) => cancelSupplierOrder(c, id));
}
export async function receiveSupplierOrderAction(id: string): Promise<FormState> {
  let receiptId: string | undefined;
  const res = await op(op_(id), async (c) => {
    receiptId = (await receiveSupplierOrder(c, id)).id;
  });
  if (!receiptId) return res;
  redirect(`/app/stock/receipts/${receiptId}`);
}

// --- списания ---

const wp = (id: string) => `/app/stock/writeoffs/${id}`;

export async function createWriteOffAction(_: FormState, fd: FormData) {
  return create("/app/stock/writeoffs", (c) => createWriteOff(c, fields(fd)));
}
export async function updateWriteOffAction(id: string, _: FormState, fd: FormData) {
  return op(wp(id), (c) => updateWriteOff(c, id, fields(fd)));
}
export async function addWriteOffLineAction(id: string, _: FormState, fd: FormData) {
  return op(wp(id), (c) =>
    addWriteOffLine(c, id, {
      productId: fields(fd).productId,
      qty: num(fd, "qty"),
    }),
  );
}
export async function removeWriteOffLineAction(id: string, lineId: string) {
  return op(wp(id), (c) => removeWriteOffLine(c, id, lineId));
}
export async function postWriteOffAction(id: string) {
  return op(wp(id), (c) => postWriteOff(c, id));
}
export async function unpostWriteOffAction(id: string) {
  return op(wp(id), (c) => unpostWriteOff(c, id));
}

// --- инвентаризация ---

const ip = (id: string) => `/app/stock/inventory/${id}`;

export async function createInventoryAction(_: FormState, fd: FormData) {
  return create("/app/stock/inventory", (c) => createInventory(c, fields(fd)));
}
export async function updateInventoryCommentAction(id: string, _: FormState, fd: FormData) {
  return op(ip(id), (c) => updateInventoryComment(c, id, fields(fd)));
}
export async function saveInventoryCountsAction(id: string, _: FormState, fd: FormData) {
  return op(ip(id), (c) => {
    const counts: Record<string, number> = {};
    for (const [k, v] of fd.entries()) {
      if (!k.startsWith("q_") || typeof v !== "string") continue;
      const n = Number(v.replace(",", ".").trim());
      if (v.trim() === "" || !Number.isFinite(n)) throw new UserError("Фактическое количество: введите число");
      counts[k.slice(2)] = n;
    }
    return saveInventoryCounts(c, id, counts);
  });
}
export async function addInventoryLineAction(id: string, _: FormState, fd: FormData) {
  return op(ip(id), (c) =>
    addInventoryLine(c, id, {
      productId: fields(fd).productId,
      actualQty: num(fd, "actualQty"),
    }),
  );
}
/** Кнопка внутри формы подсчёта (formAction), поэтому результат не возвращается. */
export async function removeInventoryLineAction(id: string, lineId: string): Promise<void> {
  await op(ip(id), (c) => removeInventoryLine(c, id, lineId));
}
export async function postInventoryAction(id: string) {
  return op(ip(id), (c) => postInventory(c, id));
}
export async function unpostInventoryAction(id: string) {
  return op(ip(id), (c) => unpostInventory(c, id));
}

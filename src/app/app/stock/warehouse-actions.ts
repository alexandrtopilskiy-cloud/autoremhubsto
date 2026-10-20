"use server";

import { redirect } from "next/navigation";
import type { SessionCtx } from "@/lib/auth";
import { fields, num, rub, type FormState } from "@/lib/actions";
import { UserError } from "@/lib/errors";
import { guarded } from "@/lib/guard";
import { resolveProductId } from "@/lib/services/catalog";
import { assertCan, assertFlag, checkDiscount, type Level } from "@/lib/permissions";
import {
  addDeficitLines,
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

/** Создаёт документ и открывает его. */
async function create(list: string, fn: (companyId: string) => Promise<{ id: string }>, costs = false): Promise<FormState> {
  let id: string | undefined;
  const res = await op(
    list,
    async (c) => {
      id = (await fn(c)).id;
    },
    "CREATE",
    costs,
  );
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
  return op(sp(id), async (c, s) => {
    if (fd.get("price")?.toString().trim()) assertFlag(s.perms, "prices");
    checkDiscount(s.perms, fd.get("discount"));
    return addSaleLine(c, id, {
      productId: await resolveProductId(c, fields(fd)),
      qty: num(fd, "qty"),
      price: optRub(fd, "price", "Цена"),
      discount: num(fd, "discount"),
    });
  });
}
export async function removeSaleLineAction(id: string, lineId: string) {
  return op(sp(id), (c) => removeSaleLine(c, id, lineId));
}
export async function postSaleAction(id: string) {
  return op(sp(id), (c) => postSale(c, id), "FULL");
}
export async function unpostSaleAction(id: string) {
  return op(sp(id), (c) => unpostSale(c, id), "FULL");
}
export async function addSalePaymentAction(id: string, _: FormState, fd: FormData) {
  return op(sp(id), (c, s) => {
    assertCan(s.perms, "cash", "CREATE");
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
  return create("/app/stock/orders", (c) => createSupplierOrder(c, fields(fd)), true);
}
export async function updateSupplierOrderAction(id: string, _: FormState, fd: FormData) {
  return op(op_(id), (c) => updateSupplierOrder(c, id, fields(fd)), "EDIT", true);
}
export async function addSupplierOrderLineAction(id: string, _: FormState, fd: FormData) {
  return op(op_(id), async (c) =>
    addSupplierOrderLine(c, id, {
      productId: await resolveProductId(c, fields(fd)),
      qty: num(fd, "qty"),
      cost: optRub(fd, "cost", "Цена"),
    }),
    "EDIT", true,
  );
}
export async function addDeficitLinesAction(id: string, _: FormState, fd: FormData) {
  return op(op_(id), (c) => addDeficitLines(c, id, fields(fd).groupId || undefined), "EDIT", true);
}
export async function removeSupplierOrderLineAction(id: string, lineId: string) {
  return op(op_(id), (c) => removeSupplierOrderLine(c, id, lineId), "EDIT", true);
}
export async function sendSupplierOrderAction(id: string) {
  return op(op_(id), (c) => sendSupplierOrder(c, id), "EDIT", true);
}
export async function reopenSupplierOrderAction(id: string) {
  return op(op_(id), (c) => reopenSupplierOrder(c, id), "EDIT", true);
}
export async function cancelSupplierOrderAction(id: string) {
  return op(op_(id), (c) => cancelSupplierOrder(c, id), "FULL", true);
}
export async function receiveSupplierOrderAction(id: string): Promise<FormState> {
  let receiptId: string | undefined;
  const res = await op(op_(id), async (c) => {
    receiptId = (await receiveSupplierOrder(c, id)).id;
  }, "CREATE", true);
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
  return op(wp(id), async (c) =>
    addWriteOffLine(c, id, {
      productId: await resolveProductId(c, fields(fd)),
      qty: num(fd, "qty"),
    }),
  );
}
export async function removeWriteOffLineAction(id: string, lineId: string) {
  return op(wp(id), (c) => removeWriteOffLine(c, id, lineId));
}
export async function postWriteOffAction(id: string) {
  return op(wp(id), (c) => postWriteOff(c, id), "FULL");
}
export async function unpostWriteOffAction(id: string) {
  return op(wp(id), (c) => unpostWriteOff(c, id), "FULL");
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
  return op(ip(id), async (c) =>
    addInventoryLine(c, id, {
      productId: await resolveProductId(c, fields(fd)),
      actualQty: num(fd, "actualQty"),
    }),
  );
}
/** Кнопка внутри формы подсчёта (formAction), поэтому результат не возвращается. */
export async function removeInventoryLineAction(id: string, lineId: string): Promise<void> {
  await op(ip(id), (c) => removeInventoryLine(c, id, lineId));
}
export async function postInventoryAction(id: string) {
  return op(ip(id), (c) => postInventory(c, id), "FULL");
}
export async function unpostInventoryAction(id: string) {
  return op(ip(id), (c) => unpostInventory(c, id), "FULL");
}

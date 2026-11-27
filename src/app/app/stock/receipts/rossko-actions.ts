"use server";

import { fetchRosskoOrders } from "@/lib/services/rossko";
import { createReceiptFromRosskoParts, SelectedRosskoPart } from "@/lib/services/rossko-receipt";

export async function getRosskoOrdersAction() {
  try {
    const orders = await fetchRosskoOrders(50);

    return { success: true, orders };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);

    return { success: false, error: message };
  }
}

export async function createReceiptFromPartsAction(parts: SelectedRosskoPart[]) {
  try {
    const receiptId = await createReceiptFromRosskoParts(parts);

    return { success: true, receiptId };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    return { success: false, error: message };
  }
}


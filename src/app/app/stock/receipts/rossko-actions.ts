"use server";

import { fetchRosskoOrders } from "@/lib/services/rossko";
import { createReceiptFromRosskoParts, SelectedRosskoPart } from "@/lib/services/rossko-receipt";

export async function getRosskoOrdersAction() {
  try {
    const orders = await fetchRosskoOrders(50);
    return { success: true, orders };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function createReceiptFromPartsAction(parts: SelectedRosskoPart[]) {
  try {
    const receiptId = await createReceiptFromRosskoParts(parts);
    return { success: true, receiptId };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}


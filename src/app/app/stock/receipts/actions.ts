import { fetchRosskoOrders } from "@/lib/services/rossko";

export async function getRosskoOrdersAction() {
  try {
    const orders = await fetchRosskoOrders(50); // Берем последние 50 заказов
    return { success: true, orders };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

import { fetchRosskoOrders } from "@/lib/services/rossko";

export async function getRosskoOrdersAction() {
  try {
    const orders = await fetchRosskoOrders(50);

    return { success: true, orders };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e)

    return { success: false, error: message };
  }
}

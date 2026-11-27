import { type RosskoOrder, type RosskoResponse } from "./rossko-types";
import { createClientAsync } from "soap";
import { getIntegration } from "./integrations";
import { IntegrationProvider } from "@prisma/client";

const ROSSKO_WSDL_URL = process.env.ROSSKO_WSDL_URL as string;
const ROSSKO_WSDL = ROSSKO_WSDL_URL + '/GetOrders?wsdl';

export async function checkRosskoConnection(): Promise<{ success: boolean; message: string }> {
  const integration = await getIntegration(IntegrationProvider.ROSSKO);

  if (!integration || !integration.credentials?.key1 || !integration.credentials?.key2) {
    return { success: false, message: "Ключи Rossko не настроены" };
  }

  const { key1, key2 } = integration.credentials;

  try {
    // Создаем клиент. Он сам скачает WSDL и подготовит методы.
    const client = await createClientAsync(ROSSKO_WSDL);

    // Вызываем метод GetOrders. Аргументы передаются объектом.
    const [result] = await client.GetOrdersAsync({
      KEY1: key1,
      KEY2: key2,
      limit: 1,
    });

    const res = result as RosskoResponse;

    if (res.OrdersResult && res.OrdersResult.success === true) {
      return { success: true, message: "Подключение успешно!" };
    }

    return { success: false, message: `Rossko: ${res.OrdersResult?.message || "Неизвестная ошибка"}` };
  } catch (error: unknown) {
    console.error("Ошибка SOAP клиента:", error);

    const soapError = error as { root?: { Envelope?: { Body?: { Fault?: { faultstring?: string } } } }, message?: string };
    const fault = soapError.root?.Envelope?.Body?.Fault;

    if (fault) {
       return { success: false, message: `Ошибка Rossko: ${fault.faultstring || "Неизвестно"}` };
    }

    return { success: false, message: `Сетевая ошибка: ${soapError.message || "Неизвестно"}` };
  }
}

/**
 * Получить список заказов из Rossko.
 * @param limit Ограничение количества (по умолчанию 20, макс 500)
 * @param orderIds Массив ID заказов (если нужно получить конкретные)
 */
export async function fetchRosskoOrders(limit: number = 20, orderIds?: number[]): Promise<RosskoOrder[]> {
  const integration = await getIntegration(IntegrationProvider.ROSSKO);
  if (!integration || !integration.credentials?.key1) {
    throw new Error("Интеграция Rossko не настроена");
  }

  const { key1, key2 } = integration.credentials;
  const client = await createClientAsync(ROSSKO_WSDL);

  const params: Record<string, unknown> = { KEY1: key1, KEY2: key2, limit };
  if (orderIds && orderIds.length > 0) {
    params.order_ids = orderIds;
  }

  const [result] = await client.GetOrdersAsync(params);
  const res = result as RosskoResponse;

  if (res.OrdersResult?.success === true && res.OrdersResult?.OrdersList?.Order) {
    return res.OrdersResult.OrdersList.Order;
  }
  
  if (res.OrdersResult?.success === false) {
    throw new Error(`Rossko API Error: ${res.OrdersResult.message}`);
  }

  return [];
}


import axios from "axios";
import { getIntegration } from "./integrations";
import { IntegrationProvider } from "@prisma/client";
import { UserError } from "@/lib/errors";

const ROSSKO_WSDL_URL = process.env.ROSSKO_WSDL_URL || "https://api.rossko.ru/service/v2.1/GetOrders";

/**
 * Проверяет подключение к Rossko API.
 * Делает тестовый запрос GetOrders с limit=1.
 */
export async function checkRosskoConnection(): Promise<{ success: boolean; message: string }> {
  const integration = await getIntegration(IntegrationProvider.ROSSKO);
  
  if (!integration || !integration.credentials?.key1 || !integration.credentials?.key2) {
    return { success: false, message: "Ключи Rossko не настроены" };
  }

  const { key1, key2 } = integration.credentials;

  // Формируем SOAP XML запрос
  const xmlRequest = `
    <soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://api.rossko.ru/">
       <soapenv:Header/>
       <soapenv:Body>
          <ser:GetOrders>
             <ser:KEY1>${key1}</ser:KEY1>
             <ser:KEY2>${key2}</ser:KEY2>
             <ser:limit>1</ser:limit>
          </ser:GetOrders>
       </soapenv:Body>
    </soapenv:Envelope>
  `;

  try {
    const response = await axios.post(ROSSKO_WSDL_URL, xmlRequest, {
      headers: {
        "Content-Type": "text/xml;charset=UTF-8",
        "SOAPAction": "GetOrders",
      },
      timeout: 10000, // 10 секунд таймаут
    });

    // Если в ответе есть слово "error" или "fault" (простая эвристика для SOAP)
    if (response.data.includes("<faultstring>") || response.data.includes("<error>")) {
      return { success: false, message: "Rossko вернул ошибку авторизации. Проверьте ключи." };
    }

    return { success: true, message: "Подключение успешно!" };
  } catch (error: any) {
    console.error("Rossko API Error:", error.message);
    if (error.code === "ECONNABORTED") {
      return { success: false, message: "Превышено время ожидания ответа от Rossko." };
    }
    return { success: false, message: "Ошибка сети. Не удалось связаться с Rossko." };
  }
}

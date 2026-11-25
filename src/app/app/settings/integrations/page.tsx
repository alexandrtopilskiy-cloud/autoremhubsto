import { Card, Field, Input, PageTitle } from "@/components/ui";
import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { requireSession } from "@/lib/auth";
import { getIntegration } from "@/lib/services/integrations";
import { IntegrationProvider } from "@prisma/client";
import { saveRosskoSettingsAction } from "./actions";
import { CheckConnectionButton } from "./check-button";

export default async function IntegrationsPage() {
  const s = await requireSession();
  
  // Получаем текущие настройки Rossko (если они есть)
  const rossko = await getIntegration(IntegrationProvider.ROSSKO);
  const rosskoKeys = rossko?.credentials || {};

  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Интеграции</PageTitle>
      
      <Allowed perms={s.perms} section="settings">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* Карточка Rossko */}
          <Card title="Rossko">
            <p className="mb-4 text-sm text-slate-600">
              Интеграция позволяет получать заказы, оформленные на сайте Rossko, и создавать на их основе приходные накладные.
            </p>
            
            <ActionForm action={saveRosskoSettingsAction} className="flex flex-col gap-3">
              <Field label="Ключ доступа 1 (KEY1)">
                <Input 
                  name="key1" 
                  defaultValue={rosskoKeys.key1 ?? ""} 
                  placeholder="Вставьте KEY1 из личного кабинета Rossko" 
                  required 
                />
              </Field>
              
              <Field label="Ключ доступа 2 (KEY2)">
                <Input 
                  name="key2" 
                  defaultValue={rosskoKeys.key2 ?? ""} 
                  placeholder="Вставьте KEY2 из личного кабинета Rossko" 
                  required 
                />
              </Field>

              <div className="flex items-center gap-4 mt-2">
                <Submit>Сохранить настройки</Submit>
                <CheckConnectionButton />
                {rossko && (
                  <span className="text-sm text-green-600 font-medium">
                    ✓ Настройки сохранены
                  </span>
                )}
              </div>
            </ActionForm>
          </Card>

          {/* Заглушки для других провайдеров */}
          <Card title="ЕвроАвто">
            <p className="text-sm text-slate-500">Интеграция находится в разработке.</p>
          </Card>
          
          <Card title="АвтоЕвро">
            <p className="text-sm text-slate-500">Интеграция находится в разработке.</p>
          </Card>
          
          <Card title="ТехноВектор (Стенд развала-схождения)">
            <p className="text-sm text-slate-500">Интеграция находится в разработке.</p>
          </Card>

        </div>
      </Allowed>
    </div>
  );
}

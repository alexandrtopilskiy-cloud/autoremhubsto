import { notFound, redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { prisma } from "@/lib/db";
import { isLocalRuntime } from "@/lib/local-runtime";
import { localPairAction, localSetupAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function LocalSetupPage() {
  if (!isLocalRuntime()) notFound();
  if (await prisma.company.findFirst({ select: { id: true } })) redirect("/login");

  return (
    <>
      <Card title="Настройка офлайн-кабинета">
        <p className="mb-3 text-sm text-slate-600">В разделе «Резервный ПК» на сайте получите код загрузки снимка. Для входа используйте email владельца СТО и отдельный локальный пароль.</p>
        <ActionForm action={localSetupAction} className="flex flex-col gap-3">
          <Field label="Код загрузки снимка">
            <Input name="code" required minLength={32} maxLength={32} autoComplete="off" />
          </Field>
          <Field label="Локальный пароль">
            <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Submit>Загрузить снимок</Submit>
        </ActionForm>
      </Card>
      <details className="rounded-md bg-white p-4 text-sm">
        <summary className="cursor-pointer font-medium">Привязать новый ПК</summary>
        <ActionForm action={localPairAction} className="mt-3 flex flex-col gap-3">
          <p>После привязки обновите статус на сайте, затем получите код загрузки.</p>
          <Field label="Код привязки с сайта">
            <Input name="pairingCode" required minLength={32} maxLength={32} autoComplete="off" />
          </Field>
          <Submit>Привязать ПК</Submit>
        </ActionForm>
      </details>
    </>
  );
}

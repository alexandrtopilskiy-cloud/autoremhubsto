import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { prisma } from "@/lib/db";
import { isLocalRuntime } from "@/lib/local-runtime";
import { loginAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ "local-ready"?: string }> }) {
  const local = isLocalRuntime();
  const localReady = local ? (await searchParams)["local-ready"] : undefined;
  const needsSetup = local && !await prisma.company.findFirst({ select: { id: true } });
  return (
    <Card title="Вход">
      {!needsSetup && localReady && (
        <p className="mb-3 text-sm text-slate-600" role="status">
          {localReady === "1"
            ? "Снимок подтверждён. Войдите с email владельца и локальным паролем."
            : "Снимок загружен. Сервер не подтвердил сверку."}
        </p>
      )}
      {needsSetup ? (
        <Link className="text-blue-600" href="/local-setup">Настроить офлайн-кабинет</Link>
      ) : (
        <ActionForm action={loginAction} className="flex flex-col gap-3">
          <Field label="Email">
            <Input name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Пароль">
            <Input name="password" type="password" autoComplete="current-password" required />
          </Field>
          <Submit>Войти</Submit>
        </ActionForm>
      )}
      {!local && (
        <p className="mt-3 text-sm text-slate-600">
          Нет кабинета? <Link className="text-blue-600" href="/register">Зарегистрируйте СТО</Link>
          <br />
          <a className="text-blue-600 underline" href="/downloads/windows-cabinet">Скачать Программу для Windows x64</a>
        </p>
      )}
    </Card>
  );
}

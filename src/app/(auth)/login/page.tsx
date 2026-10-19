import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { loginAction } from "../actions";

export default function LoginPage() {
  return (
    <Card title="Вход">
      <ActionForm action={loginAction} className="flex flex-col gap-3">
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Пароль">
          <Input name="password" type="password" autoComplete="current-password" required />
        </Field>
        <Submit>Войти</Submit>
      </ActionForm>
      <p className="mt-3 text-sm text-slate-600">
        Нет кабинета? <Link className="text-blue-600" href="/register">Зарегистрируйте СТО</Link>
      </p>
    </Card>
  );
}

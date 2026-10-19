import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Input } from "@/components/ui";
import { registerAction } from "../actions";

export default function RegisterPage() {
  return (
    <Card title="Регистрация СТО">
      <ActionForm action={registerAction} className="flex flex-col gap-3">
        <Field label="Название СТО">
          <Input name="companyName" required />
        </Field>
        <Field label="Город">
          <Input name="city" />
        </Field>
        <Field label="Ваше имя">
          <Input name="name" autoComplete="name" required />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Пароль (не короче 8 символов)">
          <Input name="password" type="password" autoComplete="new-password" minLength={8} required />
        </Field>
        <Submit>Создать кабинет</Submit>
      </ActionForm>
      <p className="mt-3 text-sm text-slate-600">
        Уже есть кабинет? <Link className="text-blue-600" href="/login">Войти</Link>
      </p>
    </Card>
  );
}

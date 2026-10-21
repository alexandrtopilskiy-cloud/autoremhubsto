"use client";

import { useActionState } from "react";
import type { FormState } from "@/lib/actions";

/** Кнопка «Удалить в корзину» с подтверждением; ошибка (например, документ проведён) показывается рядом. */
export function TrashButton({
  action,
  label = "Удалить",
  question = "Удалить документ? Его можно будет восстановить из корзины.",
  small,
  disabled,
  title,
}: {
  action: () => Promise<FormState>;
  label?: string;
  question?: string;
  /** компактная кнопка для строки списка */
  small?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(question)) e.preventDefault();
      }}
      className="flex items-center gap-2"
    >
      <button
        disabled={pending || disabled}
        title={title}
        className={`rounded-md border border-red-300 bg-white text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40 ${small ? "px-2 py-1" : "px-3 py-2"}`}
      >
        {pending ? "…" : label}
      </button>
      {state?.error && <span className="text-sm text-red-600">{state.error}</span>}
    </form>
  );
}

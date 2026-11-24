"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Submit } from "@/components/form";
import { issueWorkstationCodeAction } from "./actions";

export function PairForm({ pendingCode }: { pendingCode: boolean }) {
  const [state, action] = useActionState(issueWorkstationCodeAction, null);
  const router = useRouter();
  const code = state && "code" in state ? state.code : null;

  return (
    <form action={action} className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Submit>{code || pendingCode ? "Получить новый код" : "Получить код"}</Submit>
        <button type="button" className="rounded-md border border-slate-300 px-3 py-2 text-sm" onClick={() => router.refresh()}>
          Проверить статус
        </button>
      </div>
      {state && "error" in state && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      {code && (
        <p role="status" className="text-sm">
          Код действует 10 минут. Вставьте его в скрипт на резервном ПК.
          <code className="mt-1 block w-fit max-w-full select-all break-all rounded bg-slate-100 px-3 py-2 text-base">{code}</code>
        </p>
      )}
    </form>
  );
}

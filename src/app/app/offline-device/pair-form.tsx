"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Submit } from "@/components/form";
import { issueWorkstationCodeAction } from "./actions";

export function PairForm({ pendingCode }: { pendingCode: boolean }) {
  const [state, action] = useActionState(issueWorkstationCodeAction, null);
  const router = useRouter();
  const code = state && "code" in state ? state.code : null;
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copyCode(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedCode(value);
      setCopyError(null);
    } catch {
      setCopyError(value);
    }
  }

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
        <div className="space-y-2 text-sm">
          <p>Код действует 10 минут.</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="w-fit max-w-full select-all break-all rounded bg-slate-100 px-3 py-2 text-base">{code}</code>
            <button type="button" className="rounded-md border border-slate-300 px-3 py-2" onClick={() => void copyCode(code)}>
              Скопировать код
            </button>
            {copiedCode === code && copyError !== code && <p role="status">Код скопирован</p>}
          </div>
          {copyError === code && <p role="status">Выделите код и скопируйте его вручную.</p>}
        </div>
      )}
    </form>
  );
}

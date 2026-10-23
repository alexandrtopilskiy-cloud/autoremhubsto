"use client";

import { startTransition, useActionState } from "react";
import { importAdDocsAction, type AdDocsState } from "./actions";

const SHOWN = 50;
const LABELS = { orders: "Заказ-наряды", receipts: "Приходные накладные", sales: "Расходные накладные", money: "Движение денег" };

/** Загрузка выгрузки документов АвтоДилера с отчётом: что будет создано или список ошибок. */
export function AdDocsForm() {
  const [state, action, pending] = useActionState<AdDocsState, FormData>(importAdDocsAction, undefined);
  const r = state?.report;
  const btn = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(fd));
      }}
      className="flex flex-col gap-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <input type="file" name="file" accept=".xlsx" required className="text-sm" aria-label="Файл Excel" />
        <button name="mode" value="check" disabled={pending} className={`${btn} border border-slate-300 bg-white hover:bg-slate-50`}>
          Проверить
        </button>
        <button name="mode" value="save" disabled={pending} className={`${btn} bg-blue-600 text-white hover:bg-blue-700`}>
          {pending ? "…" : "Загрузить"}
        </button>
        {pending && <span className="text-sm text-slate-500">Файл большой, это может занять до минуты</span>}
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {r && r.errors.length === 0 && (
        <div className={`text-sm ${r.saved ? "text-green-700" : "text-slate-700"}`}>
          <p>
            {r.kind && LABELS[r.kind]}. {r.saved ? "Загружено" : "Ошибок нет, можно загружать"}: {r.saved ? "создано" : "будет создано"}{" "}
            {r.created}, {r.saved ? "обновлено" : "будет обновлено"} {r.updated}.
          </p>
          <ul className="mt-1 list-inside list-disc text-slate-700">
            {r.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}
      {r && r.errors.length > 0 && (
        <div className="text-sm">
          <p className="text-red-600">Найдено ошибок: {r.errors.length}. Ничего не загружено: исправьте файл и загрузите снова.</p>
          <ul className="mt-1 list-inside list-disc text-slate-700">
            {r.errors.slice(0, SHOWN).map((e) => (
              <li key={`${e.row}-${e.message}`}>
                Строка {e.row}: {e.message}
              </li>
            ))}
          </ul>
          {r.errors.length > SHOWN && <p className="text-slate-500">и ещё {r.errors.length - SHOWN}</p>}
        </div>
      )}
    </form>
  );
}

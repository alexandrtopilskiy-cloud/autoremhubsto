"use client";

import { startTransition, useActionState } from "react";
import { importAction, type ImportState } from "./actions";

const SHOWN = 50;

/** Загрузка файла с отчётом: сколько записей создано и обновлено или список ошибок по строкам. */
export function ImportForm({ kind }: { kind: string }) {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction.bind(null, kind), undefined);
  const r = state?.report;
  const btn = "rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";
  // отправка вручную: форма не сбрасывается, и после «Проверить» тот же файл можно сразу загрузить
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
      </div>
      {state?.error && <p className="text-sm text-red-600">{state.error}</p>}
      {r && r.errors.length === 0 && (
        <p className={`text-sm ${r.saved ? "text-green-700" : "text-slate-700"}`}>
          {r.saved ? "Загружено" : "Ошибок нет, можно загружать"}: {r.saved ? "создано" : "будет создано"} {r.created},{" "}
          {r.saved ? "обновлено" : "будет обновлено"} {r.updated}
          {r.vehicles > 0 && `, автомобилей ${r.saved ? "добавлено" : "будет добавлено"} ${r.vehicles}`}.
        </p>
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

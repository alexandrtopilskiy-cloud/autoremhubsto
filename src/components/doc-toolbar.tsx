"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { FormState } from "@/lib/actions";
import { CLOSE_TAB_EVENT } from "./app-shell/tab-title";
import { DOC_SAVED_EVENT } from "./form";
import { IconButton } from "./icon-button";

const FORMS = "form[data-doc-form]";

/** Отправляет форму документа и ждёт ответа сервера; false — форма не прошла проверку или сервер вернул ошибку. */
function submit(form: HTMLFormElement): Promise<boolean> {
  if (!form.reportValidity()) return Promise.resolve(false);
  return new Promise((resolve) => {
    const done = (e: Event) => {
      const d = (e as CustomEvent<{ form: HTMLFormElement; ok: boolean }>).detail;
      if (d.form !== form) return;
      window.removeEventListener(DOC_SAVED_EVENT, done);
      resolve(d.ok);
    };
    window.addEventListener(DOC_SAVED_EVENT, done);
    form.requestSubmit();
  });
}

/**
 * Панель кнопок документа: Сохранить, Сохранить и выйти, Провести, Выйти — иконками с подсказкой.
 * Сохраняются все формы страницы, помеченные ActionForm doc. «Выйти» при несохранённых изменениях спрашивает подтверждение.
 */
export function DocToolbar({
  exitHref,
  editable,
  post,
  postLabel = "Провести",
  unpost,
  children,
  trash,
}: {
  /** куда вернуться после выхода (список документов) */
  exitHref: string;
  /** документ можно менять: показываются кнопки сохранения */
  editable: boolean;
  post?: () => Promise<FormState>;
  postLabel?: string;
  unpost?: () => Promise<FormState>;
  /** свои действия документа (словами) */
  children?: ReactNode;
  /** кнопка удаления, ставится отдельно в конце */
  trash?: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  // не useTransition: ответ формы (useActionState) не дошёл бы до экрана, пока идёт наш переход, и ожидание бы зависло
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [asking, setAsking] = useState(false);
  const dirty = useRef(false);
  const stay = useRef<HTMLButtonElement>(null);

  // любое изменение поля в формах документа — есть несохранённые изменения
  useEffect(() => {
    const mark = (e: Event) => {
      if ((e.target as Element | null)?.closest?.(FORMS)) dirty.current = true;
    };
    document.addEventListener("input", mark);
    document.addEventListener("change", mark);
    return () => {
      document.removeEventListener("input", mark);
      document.removeEventListener("change", mark);
    };
  }, []);

  useEffect(() => {
    if (!asking) return;
    stay.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setAsking(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [asking]);

  const save = async () => {
    setError(undefined);
    for (const form of Array.from(document.querySelectorAll<HTMLFormElement>(FORMS))) {
      if (!(await submit(form))) return false;
    }
    dirty.current = false;
    return true;
  };

  const leave = () => {
    window.dispatchEvent(new CustomEvent(CLOSE_TAB_EVENT, { detail: { path: pathname } }));
    router.push(exitHref);
  };

  const start = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const call = (fn: () => Promise<FormState>) =>
    start(async () => {
      const res = await fn();
      if (res?.error) setError(res.error);
      else router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {editable && (
        <>
          <IconButton icon="save" label="Сохранить" disabled={busy} onClick={() => start(save)} />
          <IconButton icon="saveExit" label="Сохранить и выйти" disabled={busy} onClick={() => start(async () => void ((await save()) && leave()))} />
        </>
      )}
      {editable && post && (
        <IconButton
          icon="post"
          tone="post"
          label={postLabel}
          disabled={busy}
          onClick={() =>
            start(async () => {
              if (!(await save())) return;
              const res = await post();
              if (res?.error) setError(res.error);
              else router.refresh();
            })
          }
        />
      )}
      {!editable && unpost && <IconButton icon="unpost" label="Отменить проведение" disabled={busy} onClick={() => call(unpost)} />}
      <IconButton icon="exit" label={editable ? "Выйти без сохранения" : "Выйти"} disabled={busy} onClick={() => (editable && dirty.current ? setAsking(true) : leave())} />
      {children}
      {trash && (
        <>
          <span className="mx-1 h-6 w-px bg-slate-300" aria-hidden />
          {trash}
        </>
      )}
      {error && <span className="w-full text-right text-sm text-red-600">{error}</span>}

      {asking && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={(e) => e.target === e.currentTarget && setAsking(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="leave-title" className="flex w-full max-w-lg flex-col gap-3 rounded-lg bg-white p-5 shadow-xl">
            <h2 id="leave-title" className="text-lg font-semibold">
              Выйти без сохранения?
            </h2>
            <p className="text-sm text-slate-600">В документе есть несохранённые изменения. Если выйти сейчас, они пропадут.</p>
            <div className="flex justify-center gap-2 whitespace-nowrap">
              <button ref={stay} type="button" onClick={() => setAsking(false)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                Остаться
              </button>
              <button
                type="button"
                onClick={() => {
                  setAsking(false);
                  start(async () => void ((await save()) && leave()));
                }}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Сохранить и выйти
              </button>
              <button type="button" onClick={leave} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">
                Выйти без сохранения
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

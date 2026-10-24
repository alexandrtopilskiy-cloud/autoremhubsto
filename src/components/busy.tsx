"use client";
// Обновление списков без перезагрузки страницы: форма фильтров применяет выбор сразу,
// а пока сервер готовит новый список, сверху бежит тонкая полоса и список бледнеет.
import { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore, useTransition, type ReactNode } from "react";

// сколько переходов списков сейчас ждут ответа сервера
let count = 0;
const subs = new Set<() => void>();
const bump = (d: number) => {
  count += d;
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Отмечает переход списка как идущий, пока pending. */
export function useBusy(pending: boolean) {
  useEffect(() => {
    if (!pending) return;
    bump(1);
    return () => bump(-1);
  }, [pending]);
}

/** Идёт ли сейчас обновление какого-нибудь списка. */
export const useIsBusy = () =>
  useSyncExternalStore(
    subscribe,
    () => count > 0,
    () => false,
  );

/** Полоса загрузки вверху окна. */
export function BusyBar() {
  const busy = useIsBusy();
  return (
    <div aria-hidden className={`pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden transition-opacity print:hidden ${busy ? "opacity-100 delay-100" : "opacity-0"}`}>
      <div className="busy-bar h-full w-1/3 bg-blue-500" />
    </div>
  );
}

/** Внутри Link: пока переход по ссылке (сортировка, страница) не закончен, показывает полосу загрузки. */
export function LinkBusy() {
  const { pending } = useLinkStatus();
  useBusy(pending);
  return null;
}

/** Переход внутри списка без перезагрузки страницы, с полосой загрузки. */
export function useListNav() {
  const router = useRouter();
  const [pending, start] = useTransition();
  useBusy(pending);
  return (href: string) => start(() => router.replace(href, { scroll: false }));
}

// поля, в которые печатают: список обновляется, когда перестали печатать
const typed = (t: EventTarget) => t instanceof HTMLInputElement && !["checkbox", "radio"].includes(t.type);

/**
 * Форма фильтров списка (GET): выбор в списках и галочках применяется сразу, поиск и даты — через 0,4 с
 * после ввода, Enter и «Найти» — сразу. Страница не перезагружается, курсор остаётся в поле.
 */
export function LiveForm({ action, id, className, children }: { action?: string; id?: string; className?: string; children: ReactNode }) {
  const pathname = usePathname();
  const go = useListNav();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const path = action ?? pathname;
  function apply(form: HTMLFormElement) {
    clearTimeout(timer.current);
    const p = new URLSearchParams();
    for (const [k, v] of new FormData(form)) if (typeof v === "string" && v) p.set(k, v);
    const qs = p.toString();
    go(qs ? `${path}?${qs}` : path);
  }
  return (
    <form
      id={id}
      action={path}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        apply(e.currentTarget);
      }}
      onChange={(e) => {
        const form = e.currentTarget;
        clearTimeout(timer.current);
        if (typed(e.target)) timer.current = setTimeout(() => apply(form), 400);
        else apply(form);
      }}
    >
      {children}
    </form>
  );
}

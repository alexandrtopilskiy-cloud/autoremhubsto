"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/actions";

/** Форма документа сообщила результат сохранения. */
export const DOC_SAVED_EVENT = "ar:doc-saved";

type Action = (state: FormState, fd: FormData) => Promise<FormState>;

export function ActionForm({
  id,
  action,
  children,
  className,
  reset = false,
  doc = false,
}: {
  id?: string;
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  /** форма полей документа: её сохраняют кнопки панели документа (DocToolbar) */
  doc?: boolean;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (reset && state?.ok) ref.current?.reset();
    if (doc && state && ref.current) window.dispatchEvent(new CustomEvent(DOC_SAVED_EVENT, { detail: { form: ref.current, ok: !state.error } }));
  }, [state, reset, doc]);
  return (
    <form id={id} ref={ref} action={formAction} className={className} {...(doc ? { "data-doc-form": "" } : {})}>
      {children}
      {state?.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function Submit({ children, variant = "primary" }: { children: ReactNode; variant?: "primary" | "ghost" | "danger" }) {
  const { pending } = useFormStatus();
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    ghost: "border border-slate-300 bg-white hover:bg-slate-50",
    danger: "border border-red-300 bg-white text-red-700 hover:bg-red-50",
  }[variant];
  return (
    <button type="submit" disabled={pending} className={`rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 ${styles}`}>
      {pending ? "…" : children}
    </button>
  );
}

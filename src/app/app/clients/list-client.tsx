"use client";
// Список клиентов: один клик по строке — просмотр справа, двойной — карточка в новой вкладке.
// Панель просмотра: ширина меняется перетаскиванием левой границы, «Скрыть» и клик мимо панели её сворачивают.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const ROW = "data-preview-row";
const STORE = "ar.clientPreview";
const MIN = 260;
const MAX = 760;

export function ClientRow({ id, previewHref, selected, children }: { id: string; previewHref: string; selected: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <tr
      {...{ [ROW]: "" }}
      onClick={() => router.replace(previewHref, { scroll: false })}
      onDoubleClick={() => router.push(`/app/clients/${id}`)}
      className={`cursor-pointer border-b select-none last:border-0 ${selected ? "bg-blue-100" : "hover:bg-slate-50"}`}
    >
      {children}
    </tr>
  );
}

type Saved = { width: number; hidden: boolean };

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "{}");
    return { width: Math.min(MAX, Math.max(MIN, Number(v.width) || 420)), hidden: !!v.hidden };
  } catch {
    return { width: 420, hidden: false };
  }
}

export function PreviewPane({ list, panel, selected }: { list: ReactNode; panel: ReactNode; selected?: string }) {
  const [s, setS] = useState<Saved>({ width: 420, hidden: false });
  const pane = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => setS(load()), []);
  const save = (next: Saved) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  };
  // выбор клиента в списке снова показывает панель
  useEffect(() => {
    if (selected) setS((x) => (x.hidden ? { ...x, hidden: false } : x));
  }, [selected]);

  // клик мимо панели и мимо строк клиентов сворачивает просмотр
  useEffect(() => {
    if (s.hidden) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Element;
      if (dragging.current || pane.current?.contains(t) || t.closest?.(`[${ROW}]`)) return;
      save({ ...s, hidden: true });
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  });

  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    dragging.current = true;
    const x0 = e.clientX;
    const w0 = s.width;
    let w = w0;
    const move = (ev: PointerEvent) => {
      w = Math.min(MAX, Math.max(MIN, w0 + x0 - ev.clientX));
      setS((x) => ({ ...x, width: w }));
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      save({ width: w, hidden: false });
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:gap-0">
      <div className="min-w-0 flex-1 lg:pr-3">{list}</div>
      {s.hidden ? (
        <button
          type="button"
          onClick={() => save({ ...s, hidden: false })}
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 hover:text-blue-600 lg:[writing-mode:vertical-rl] lg:rounded-none lg:border-y-0 lg:border-r-0 lg:px-1.5 lg:py-3"
          title="Показать просмотр"
        >
          ‹ Просмотр
        </button>
      ) : (
        <div ref={pane} className="flex lg:sticky lg:top-0 lg:max-h-screen" style={{ ["--pw" as string]: `${s.width}px` }}>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Граница просмотра: потяните, чтобы изменить ширину"
            title="Потяните, чтобы изменить ширину"
            onPointerDown={startDrag}
            className="hidden w-2 shrink-0 cursor-col-resize touch-none items-center justify-center border-l border-slate-200 bg-slate-50 hover:bg-blue-50 lg:flex"
          >
            <span className="h-8 w-0.5 rounded bg-slate-400" />
          </div>
          <aside aria-label="Панель просмотра" className="w-full overflow-auto rounded-md border border-slate-200 bg-white lg:w-[var(--pw)] lg:rounded-none lg:border-0">
            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              <span>Просмотр</span>
              <button
                type="button"
                onClick={() => save({ ...s, hidden: true })}
                className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50"
              >
                Скрыть ›
              </button>
            </div>
            <div className="p-4">{panel}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Поле поиска: ищет, когда перестали печатать (без перезагрузки страницы, курсор остаётся в поле), или по Enter. */
export function SearchBox({ form, defaultValue, placeholder }: { form: string; defaultValue?: string; placeholder: string }) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <input
      type="search"
      name="q"
      form={form}
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-label="Поиск клиента"
      autoComplete="off"
      onChange={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const f = document.getElementById(form) as HTMLFormElement | null;
          if (!f) return;
          const p = new URLSearchParams();
          for (const [k, v] of new FormData(f)) if (typeof v === "string" && v) p.set(k, v);
          router.replace(`${f.getAttribute("action")}?${p}`, { scroll: false });
        }, 400);
      }}
      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-blue-500"
    />
  );
}

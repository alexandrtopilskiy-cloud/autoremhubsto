"use client";
// Списки: один клик по строке — просмотр справа, двойной — карточка или документ в новой вкладке.
// Панель просмотра: ширина меняется перетаскиванием левой границы, «Скрыть» и клик мимо панели её сворачивают.
// Ширина и «скрыто» запоминаются одни на все списки.
// Если списку передан load, клик по строке загружает только панель, а сам список не пересчитывается.
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useBusy, useIsBusy, useListNav } from "./busy";

const ROW = "data-preview-row";
const STORE = "ar.preview";
const MIN = 260;
const MAX = 760;
// мс между щелчками, после которых одиночный щелчок уже не станет двойным
const DOUBLE_CLICK = 200;

// клики по кнопкам, ссылкам и полям внутри строки строку не открывают
const inControl = (e: React.MouseEvent) => !!(e.target as Element).closest("a,button,input,select,textarea,label");

/** id записи из адреса просмотра (?preview=…). */
const previewOf = (href: string) => new URL(href, "http://x").searchParams.get("preview") ?? undefined;

/** Выбор строки, когда панель загружается отдельно от списка. */
const Selection = createContext<{ selected?: string; select: (id: string) => void } | null>(null);

/** Строка списка: клик — просмотр справа, двойной клик — открыть (без openHref строка только показывает просмотр). */
export function ListRow({
  previewHref,
  openHref,
  selected,
  children,
}: {
  previewHref: string;
  openHref?: string;
  selected: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const go = useListNav();
  const sel = useContext(Selection);
  const id = previewOf(previewHref);
  const active = sel ? !!id && sel.selected === id : selected;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const preview = () => (sel && id ? sel.select(id) : go(previewHref));
  return (
    <tr
      {...{ [ROW]: "" }}
      onClick={(e) => {
        // второй щелчок двойного клика — это открытие, а не новый просмотр
        if (inControl(e) || e.detail > 1) return;
        // у открываемых строк просмотр ждёт, не будет ли второго щелчка: иначе загрузка просмотра
        // и открытие документа идут одновременно, и документ загружается дважды
        clearTimeout(timer.current);
        if (openHref) timer.current = setTimeout(preview, DOUBLE_CLICK);
        else preview();
      }}
      onDoubleClick={(e) => {
        if (!openHref || inControl(e)) return;
        clearTimeout(timer.current);
        router.push(openHref);
      }}
      className={`cursor-pointer border-b select-none last:border-0 ${active ? "bg-blue-100" : "hover:bg-slate-50"}`}
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

export function PreviewPane({
  list,
  panel,
  selected,
  load: loadPanel,
}: {
  list: ReactNode;
  panel: ReactNode;
  selected?: string;
  /** Панель для записи id (серверное действие страницы); без него клик по строке перерисовывает всю страницу. */
  load?: (id: string) => Promise<ReactNode>;
}) {
  const [s, setS] = useState<Saved>({ width: 420, hidden: false });
  const pane = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const busy = useIsBusy();

  // запись, выбранная кликом, и её загруженная панель; новый ответ сервера (фильтры, страница) сбрасывает выбор к адресу
  const [chosen, setChosen] = useState(selected);
  const [loaded, setLoaded] = useState<{ id: string; node: ReactNode } | null>(null);
  const [loading, start] = useTransition();
  useBusy(loading);
  const want = useRef(selected);
  useEffect(() => {
    setChosen(selected);
    setLoaded(null);
    want.current = selected;
  }, [selected, panel]);
  const select = (id: string) => {
    if (!loadPanel) return;
    want.current = id;
    setChosen(id);
    setS((x) => (x.hidden ? { ...x, hidden: false } : x));
    // адрес страницы не меняется: замена адреса во время загрузки панели сбивала переход по двойному клику
    start(async () => {
      const node = await loadPanel(id);
      // пока панель грузилась, могли выбрать другую строку
      if (want.current === id) setLoaded({ id, node });
    });
  };
  const shown = loaded && loaded.id === chosen ? loaded.node : panel;
  const stale = chosen !== selected && !(loaded && loaded.id === chosen);

  useEffect(() => setS(load()), []);
  const save = (next: Saved) => {
    setS(next);
    try {
      localStorage.setItem(STORE, JSON.stringify(next));
    } catch {}
  };
  // выбор записи в списке снова показывает панель
  useEffect(() => {
    if (selected) setS((x) => (x.hidden ? { ...x, hidden: false } : x));
  }, [selected]);

  // клик мимо панели и мимо строк списка сворачивает просмотр
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
      <div className={`min-w-0 flex-1 transition-opacity lg:pr-3 ${busy && !loading ? "opacity-60" : ""}`} aria-busy={busy || undefined}>
        <Selection.Provider value={loadPanel ? { selected: chosen, select } : null}>{list}</Selection.Provider>
      </div>
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
            <div className={`p-4 transition-opacity ${stale ? "opacity-50" : ""}`}>{shown}</div>
          </aside>
        </div>
      )}
    </div>
  );
}

/** Применяет форму фильтров (LiveForm) без перезагрузки страницы. */
const applyFilters = (form: string) => (document.getElementById(form) as HTMLFormElement | null)?.requestSubmit();

/** Галочка-фильтр: список обновляется сразу при нажатии. */
export function FilterCheck({ form, name, checked, label }: { form: string; name: string; checked: boolean; label: string }) {
  return (
    <label className="flex items-center gap-1.5 text-sm text-slate-600">
      <input type="checkbox" name={name} value="1" form={form} defaultChecked={checked} onChange={() => applyFilters(form)} className="h-4 w-4" />
      {label}
    </label>
  );
}

/** Поле поиска: ищет, когда перестали печатать (без перезагрузки страницы, курсор остаётся в поле), или по Enter. */
export function SearchBox({ form, defaultValue, placeholder, label = "Поиск" }: { form: string; defaultValue?: string; placeholder: string; label?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (
    <input
      type="search"
      name="q"
      form={form}
      defaultValue={defaultValue}
      placeholder={placeholder}
      aria-label={label}
      autoComplete="off"
      onChange={() => {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => applyFilters(form), 400);
      }}
      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-[15px] outline-none focus:border-blue-500"
    />
  );
}

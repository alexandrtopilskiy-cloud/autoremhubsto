"use client";

import { useEffect, useId, useRef, useState, useTransition, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LineKind } from "@prisma/client";
import { Card, Field, Input, Select } from "@/components/ui";
import type { FormState } from "@/lib/actions";
import type { OrderLineOperation } from "@/lib/services/order-line-bulk";
import { formatQty } from "@/lib/format";
import { discountLabel, formatRub, lineTotal } from "@/lib/money";
import {
  attachCatalogLineAction, changeOrderLinesAction, createCatalogLineAction, lineToRecommendationAction,
  removeItemAction, removeWorkAction, saveOrderLineAction,
} from "../actions";

type Choice = { id: string; name: string; detail?: string };
type Fact = [string, string | null | undefined];
type CommonLine = {
  id: string; name: string; qty: number; price: number; discount: number; discountSum: number | null; facts: Fact[];
};
type WorkLine = CommonLine & { kind: "WORK"; unitNormHours: number; multiplicity: number; executorId: string | null };
type ItemLine = CommonLine & { kind: "ITEM"; article: string | null; brand: string | null; unit: string; stock: number | null; note: string | null };
export type OrderLine = WorkLine | ItemLine;
type Options = {
  orderId: string; editable: boolean; canCreate: boolean; canPrice: boolean; canDiscount: boolean;
  executors: Choice[]; workGroups: Choice[]; productGroups: Choice[];
};

const labels = {
  WORK: {
    title: "Работы", add: "Добавить Работу", detail: "Работа в заказ-наряде", create: "Новая работа",
    columns: ["Наименование работы", "Норма времени, ч.", "Стоимость нормочаса", "Кратность", "Стоимость", "Скидка", "Стоимость со скидкой"],
    totalQty: "Итого нормочасов", total: "Итого по работам", qtyColumn: 1, discountColumn: 5, totalColumn: 6,
  },
  ITEM: {
    title: "Запчасти", add: "Добавить Запчасть", detail: "Запчасть в заказ-наряде", create: "Новая номенклатура",
    columns: ["Наименование", "Артикул", "Производитель", "Ед. изм.", "Кол-во", "Цена", "Скидка", "Стоимость со скидкой", "Склад"],
    totalQty: "Итого количество", total: "Итого по запчастям", qtyColumn: 4, discountColumn: 6, totalColumn: 7,
  },
};
const secondary = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-700 disabled:opacity-50";
const primary = "rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const cell = "px-3 py-2.5";
const numeric = `${cell} text-right tabular-nums whitespace-nowrap`;
const dash = <span className="text-slate-400">—</span>;

function CatalogSearch({ orderId, kind, allowCreate, disabled, onPick, onCreate }: {
  orderId: string; kind: LineKind; allowCreate: boolean; disabled: boolean;
  onPick: (id: string) => void; onCreate: (query: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<DOMRect>();
  const [result, setResult] = useState<{ query: string; choices: Choice[] | null }>();
  const value = query.trim();
  const current = result?.query === value ? result : undefined;
  const choices = current?.choices ?? [];
  const canAdd = allowCreate && current?.choices?.length === 0;
  const count = choices.length + (canAdd ? 1 : 0);
  const open = focused && !!value && !!position && !disabled;

  useEffect(() => {
    if (!value || !focused) return;
    const abort = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/app/orders/${orderId}/catalog-search?${new URLSearchParams({ kind, q: value })}`, {
          signal: abort.signal, cache: "no-store",
        });
        if (!res.ok) throw new Error("search");
        const choices: Choice[] = await res.json();
        if (!abort.signal.aborted) setResult({ query: value, choices });
      } catch {
        if (!abort.signal.aborted) setResult({ query: value, choices: null });
      }
    }, 160);
    return () => { window.clearTimeout(timer); abort.abort(); };
  }, [focused, kind, orderId, value]);

  useEffect(() => {
    if (!focused) return;
    const update = () => setPosition(input.current?.getBoundingClientRect());
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [focused]);

  function choose(index: number) {
    const choice = choices[index];
    if (!choice && !canAdd) return;
    setFocused(false);
    if (choice) onPick(choice.id);
    else onCreate(value);
  }

  return (
    <>
      <input ref={input} role="combobox" aria-label={kind === "WORK" ? "Поиск работы" : "Поиск запчасти"}
        aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined}
        aria-activedescendant={open && count ? `${id}-${active}` : undefined}
        placeholder={kind === "WORK" ? "Введите наименование работы" : "Введите наименование, артикул или бренд"}
        maxLength={160} autoComplete="off" className="w-full min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500 disabled:bg-slate-100" value={query} disabled={disabled}
        onFocus={(event) => { setPosition(event.currentTarget.getBoundingClientRect()); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setPosition(event.currentTarget.getBoundingClientRect()); setFocused(true); }}
        onKeyDown={(event) => {
          if (!open) {
            if (event.key === "ArrowDown" && value) setFocused(true);
            return;
          }
          if (event.key === "Escape") setFocused(false);
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            if (count) setActive((active + (event.key === "ArrowDown" ? 1 : -1) + count) % count);
          }
          if (event.key === "Enter") { event.preventDefault(); choose(active); }
        }}
      />
      {open && createPortal(
        <div id={id} role="listbox" aria-label="Результаты поиска" className="fixed z-[60] max-h-64 overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg"
          style={{ left: Math.max(8, Math.min(position.left, window.innerWidth - 278)), width: Math.min(Math.max(270, position.width), window.innerWidth - 16),
            ...(position.bottom + 215 > window.innerHeight && position.top > 215 ? { bottom: window.innerHeight - position.top + 4 } : { top: position.bottom + 4 }) }}>
          {!current && <div role="status" className="px-3 py-2 text-sm text-slate-500">Поиск…</div>}
          {current?.choices === null && <div role="status" className="px-3 py-2 text-sm text-red-700">Не удалось загрузить результаты. Повторите поиск.</div>}
          {current?.choices?.length === 0 && <div role="status" className="px-3 py-2 text-sm text-slate-500">Совпадений нет</div>}
          {choices.map((choice, index) => (
            <button key={choice.id} id={`${id}-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1}
              className={`block w-full px-3 py-2 text-left text-sm ${active === index ? "bg-blue-50" : ""}`}
              onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(index)}>
              <span className="block font-medium text-slate-800">{choice.name}</span>
              {choice.detail && <span className="block text-xs text-slate-500">{choice.detail}</span>}
            </button>
          ))}
          {canAdd && <button id={`${id}-0`} type="button" role="option" aria-selected tabIndex={-1} onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(0)} className="block w-full border-t border-slate-100 bg-blue-50 px-3 py-2 text-left text-sm font-medium text-blue-700">
            {kind === "WORK" ? "Добавить Работу" : "Добавить"}
          </button>}
        </div>, document.body)}
    </>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog ref={dialog} aria-labelledby={titleId} onCancel={onClose}
      className="m-auto max-h-[90dvh] w-[min(40rem,calc(100%-2rem))] overflow-auto rounded-xl border border-slate-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
        <h3 id={titleId} className="text-lg font-semibold">{title}</h3>
        <button type="button" aria-label="Закрыть" className="rounded px-2 py-1 text-xl text-slate-500 hover:bg-slate-100" onClick={onClose}>×</button>
      </div>
      {children}
    </dialog>
  );
}

function GroupSelect({ groups, required }: { groups: Choice[]; required?: boolean }) {
  return <Field label="Группа"><Select name="groupId" aria-label="Группа" required={required} defaultValue="">
    <option value="">{required ? "Выберите группу" : "Без группы"}</option>
    {groups.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
  </Select></Field>;
}

function CreateFields({ kind, query, options }: { kind: LineKind; query: string; options: Options }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Наименование" className="sm:col-span-2"><Input name="name" required defaultValue={query} maxLength={240} /></Field>
      {kind === "WORK" ? <>
        {options.workGroups.length ? <GroupSelect groups={options.workGroups} required /> :
          <Field label="Новая группа работ"><Input name="workGroupName" required maxLength={100} /></Field>}
        <Field label="Норма времени, ч."><Input name="normHours" type="number" min="0.01" max="999999.99" step="0.01" /></Field>
        <Field label="Фиксированная цена, ₽"><Input name="price" inputMode="decimal" disabled={!options.canPrice} /></Field>
        <Field label="Исполнителю, %"><Input name="executorPercent" type="number" min="0" max="100" /></Field>
      </> : <>
        <GroupSelect groups={options.productGroups} />
        <Field label="Артикул"><Input name="article" /></Field>
        <Field label="Производитель"><Input name="brand" /></Field>
        <Field label="Ед. изм."><Input name="unit" defaultValue="шт" required /></Field>
        <Field label="Цена, ₽"><Input name="price" inputMode="decimal" disabled={!options.canPrice} /></Field>
        <Field label="Штрихкод"><Input name="barcode" /></Field>
        <Field label="Минимальный остаток"><Input name="minQty" type="number" min="0" step="0.001" /></Field>
      </>}
    </div>
  );
}

function LineForm({ line, options, pending, error, submit, run }: {
  line: OrderLine; options: Options; pending: boolean; error: string;
  submit: (fd: FormData) => void; run: (fn: () => Promise<FormState>) => void;
}) {
  const { editable, orderId, canPrice, canDiscount } = options;
  const initialPrice = (line.price / 100).toFixed(2).replace(".", ",");
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    if (fd.get("price") === initialPrice) fd.delete("price");
    const initialDiscount = line.discountSum == null ? String(line.discount) : "";
    if (fd.get("discount") === initialDiscount || fd.get("discount") === "") fd.delete("discount");
    submit(fd);
  }
  return (
    <form onSubmit={save} className="space-y-4 p-6">
      <div>
        <div className="text-base font-semibold">{line.name}</div>
        {!!line.facts.length && <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 rounded-md bg-slate-50 p-3 text-sm">
          {line.facts.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd>{value || dash}</dd></div>)}
        </dl>}
      </div>
      <fieldset disabled={!editable || pending} className="grid gap-3 sm:grid-cols-2 disabled:opacity-80">
        {line.kind === "WORK" ? <>
          <Field label="Норма времени, ч."><Input name="unitNormHours" type="number" required min="0.01" step="0.01" defaultValue={line.unitNormHours} /></Field>
          <Field label="Кратность"><Input name="multiplicity" type="number" required min="0.01" step="0.01" defaultValue={line.multiplicity} /></Field>
          <Field label="Исполнитель" className="sm:col-span-2"><Select name="executorId" defaultValue={line.executorId ?? ""}>
            <option value="">Не указан</option>
            {options.executors.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </Select></Field>
        </> : <Field label="Кол-во"><Input name="qty" type="number" required min="0.001" step="0.001" defaultValue={line.qty} /></Field>}
        <Field label={line.kind === "WORK" ? "Стоимость нормочаса, ₽" : "Цена, ₽"}><Input name="price" required inputMode="decimal" disabled={!canPrice} defaultValue={initialPrice} /></Field>
        <Field label={line.discountSum == null ? "Скидка, %" : `Скидка, % (сейчас ${formatRub(line.discountSum)})`}>
          <Input name="discount" type="number" min="0" max="100" disabled={!canDiscount} defaultValue={line.discountSum == null ? line.discount : ""} />
        </Field>
        {line.kind === "ITEM" && <Field label="Примечание" className="sm:col-span-2">
          <textarea name="note" rows={3} maxLength={3000} defaultValue={line.note ?? ""} placeholder="Только для этого заказ-наряда"
            className="rounded-md border border-slate-300 px-2.5 py-1.5 outline-none focus:border-blue-500" />
        </Field>}
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {editable && <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
        <button type="button" disabled={pending} className="text-sm text-red-700 hover:underline"
          onClick={() => run(() => (line.kind === "WORK" ? removeWorkAction : removeItemAction)(orderId, line.id))}>Удалить строку</button>
        <button type="button" disabled={pending} className="text-sm text-slate-700 hover:underline"
          onClick={() => run(() => lineToRecommendationAction(orderId, line.kind, line.id))}>Перенести в рекомендации</button>
        <button type="submit" disabled={pending} className={`${primary} ml-auto`}>Сохранить</button>
      </div>}
    </form>
  );
}

function LineTable({ kind, lines, options }: { kind: LineKind; lines: OrderLine[]; options: Options }) {
  const { orderId, editable, canCreate } = options;
  const [blanks, setBlanks] = useState<number[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const next = useRef(1);
  const [modal, setModal] = useState<{ line: OrderLine } | { key: number; query: string }>();
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const copy = labels[kind];
  const selectedIds = lines.filter((line) => selected.has(line.id)).map((line) => line.id);
  const allSelected = selectedIds.length > 0 && selectedIds.length === lines.length;
  const selectionDisabled = pending || selectedIds.length === 0;
  const placeholderRows = !lines.length && !blanks.length ? [0] : blanks;
  const totals = lines.reduce((sum, line) => {
    const total = lineTotal(line);
    return { qty: sum.qty + line.qty, discount: sum.discount + Math.round(line.qty * line.price) - total, total: sum.total + total };
  }, { qty: 0, discount: 0, total: 0 });

  function run(action: () => Promise<FormState>, onSuccess: () => void) {
    setError("");
    start(async () => {
      try {
        const result = await action();
        if (result?.error) setError(result.error);
        else onSuccess();
      } catch {
        setError("Не удалось выполнить действие. Повторите попытку.");
      }
    });
  }
  function toggleLine(id: string, checked: boolean) {
    setSelected((current) => {
      const nextSelection = new Set(current);
      if (checked) nextSelection.add(id);
      else nextSelection.delete(id);
      return nextSelection;
    });
  }

  function changeSelected(operation: OrderLineOperation) {
    if (selectionDisabled) return;
    if (operation === "REMOVE" && !window.confirm(`Удалить выбранные строки из заказ-наряда (${selectedIds.length})?`)) return;
    run(() => changeOrderLinesAction(orderId, kind, operation, selectedIds), () => setSelected(new Set()));
  }

  function removeBlank(key: number) {
    setBlanks((current) => current.filter((id) => id !== key));
  }
  function close() { setModal(undefined); setError(""); }
  function openLine(line: OrderLine) { setError(""); setModal({ line }); }

  return (
    <Card title={copy.title}>
      {editable && <div role="group" aria-label={`Действия со строками · ${copy.title}`} className="mb-3 flex flex-wrap items-center gap-2">
        <button type="button" className={secondary} disabled={selectionDisabled} onClick={() => changeSelected("REMOVE")}>Удалить</button>
        <button type="button" className={secondary} disabled={selectionDisabled} onClick={() => changeSelected("COPY")}>Создать копию</button>
        <button type="button" className={secondary} disabled={selectionDisabled} onClick={() => changeSelected("RECOMMEND")}>Переместить в рекомендации</button>
        {selectedIds.length > 0 && <span role="status" className="text-sm text-slate-600">Выбрано {selectedIds.length}</span>}
      </div>}
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className={`w-full border-collapse text-sm ${kind === "WORK" ? "min-w-[790px]" : "min-w-[930px]"}`}>
          <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <tr>
              {editable && <th scope="col" className="w-10 px-3">
                <input type="checkbox" aria-label={kind === "WORK" ? "Выбрать все работы" : "Выбрать все запчасти"}
                  className="size-4 align-middle accent-blue-600" checked={allSelected} disabled={pending || !lines.length}
                  ref={(input) => { if (input) input.indeterminate = !allSelected && selectedIds.length > 0; }}
                  onChange={(event) => setSelected(new Set(event.target.checked ? lines.map((line) => line.id) : []))} />
              </th>}
              {copy.columns.map((title, index) => <th key={title} scope="col"
              className={`px-3 py-2.5 ${index === 0 ? "w-[30%] text-left" : kind === "ITEM" && [1, 2, 3, 8].includes(index) ? "text-left" : "text-right"}`}>{title}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line) => (
              <tr key={line.id} onDoubleClick={() => openLine(line)} className={`cursor-pointer hover:bg-blue-50/60 ${editable && selected.has(line.id) ? "bg-blue-50" : ""}`}>
                {editable && <td className={cell} onDoubleClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" aria-label={`Выбрать: ${line.name}`} className="size-4 align-middle accent-blue-600"
                    checked={selected.has(line.id)} disabled={pending} onChange={(event) => toggleLine(line.id, event.target.checked)} />
                </td>}
                <td className={cell}><button type="button" onClick={() => openLine(line)} className="text-left font-medium text-blue-800 hover:underline">{line.name}</button></td>
                {line.kind === "WORK" ? <>
                  <td className={numeric}>{formatQty(line.unitNormHours)}</td>
                  <td className={numeric}>{formatRub(line.price)}</td>
                  <td className={numeric}>{formatQty(line.multiplicity)}</td>
                  <td className={numeric}>{formatRub(Math.round(line.qty * line.price))}</td>
                </> : <>
                  <td className={cell}>{line.article || dash}</td>
                  <td className={cell}>{line.brand || dash}</td>
                  <td className={cell}>{line.unit || dash}</td>
                  <td className={numeric}>{formatQty(line.qty)}</td>
                  <td className={numeric}>{formatRub(line.price)}</td>
                </>}
                <td className={numeric}>{discountLabel(line) || dash}</td>
                <td className={`${numeric} font-semibold`}>{formatRub(lineTotal(line))}</td>
                {line.kind === "ITEM" && <td className={cell}>{line.stock === null ? dash :
                  <><span className="block">Основной</span><span className="block whitespace-nowrap text-xs text-slate-500">Остаток {formatQty(line.stock)}</span></>}</td>}
              </tr>
            ))}
            {editable && placeholderRows.map((key) => (
              <tr key={key}>
                {editable && <td />}
                <td className={cell}><CatalogSearch orderId={orderId} kind={kind} allowCreate={canCreate} disabled={pending}
                  onPick={(id) => run(() => attachCatalogLineAction(orderId, kind, id), () => removeBlank(key))}
                  onCreate={(query) => { setError(""); setModal({ key, query }); }} /></td>
                {copy.columns.slice(1).map((column, index) => <td key={column}
                  className={kind === "ITEM" && [0, 1, 2, 7].includes(index) ? cell : numeric}>{dash}</td>)}
              </tr>
            ))}
            {!editable && !lines.length && <tr><td colSpan={copy.columns.length} className="px-3 py-4 text-sm text-slate-500">Позиции не добавлены</td></tr>}
          </tbody>
          <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-800">
            <tr>
              {editable && <td />}
              {copy.columns.map((column, index) => {
                if (index === 0) return <th key={column} scope="row" className={`${cell} text-left`}>{copy.total}</th>;
                if (index === copy.qtyColumn) return <td key={column} className={numeric} aria-label={`${copy.totalQty}: ${formatQty(totals.qty)}`}>
                  {formatQty(totals.qty)}{kind === "WORK" ? " ч." : ""}
                </td>;
                if (index === copy.discountColumn) return <td key={column} className={numeric}>{formatRub(totals.discount)}</td>;
                if (index === copy.totalColumn) return <td key={column} className={`${numeric} text-blue-800`}>{formatRub(totals.total)}</td>;
                return <td key={column} />;
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      {editable && <button type="button" disabled={pending} className={`${secondary} mt-3`}
        onClick={() => {
          const id = next.current++;
          setBlanks((current) => !lines.length && !current.length ? [0, id] : [...current, id]);
        }}>
        <span aria-hidden="true" className="mr-1 text-blue-700">+</span> {copy.add}
      </button>}
      {!modal && error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {modal && ("line" in modal ? (
        <Modal title={copy.detail} onClose={close}>
          <LineForm line={modal.line} options={options} pending={pending} error={error}
            run={(action) => run(action, close)}
            submit={(fd) => run(() => saveOrderLineAction(orderId, kind, modal.line.id, fd), close)} />
        </Modal>
      ) : (
        <Modal title={copy.create} onClose={close}>
          <form className="space-y-4 p-6" onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            run(() => createCatalogLineAction(orderId, kind, data), () => { removeBlank(modal.key); close(); });
          }}>
            <fieldset disabled={pending}><CreateFields kind={kind} query={modal.query} options={options} /></fieldset>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
              <button type="button" className={secondary} onClick={close}>Отмена</button>
              <button type="submit" disabled={pending} className={primary}>Сохранить и добавить в ЗН</button>
            </div>
          </form>
        </Modal>
      ))}
    </Card>
  );
}

export function OrderLineTables({ works, items, ...options }: Options & { works: WorkLine[]; items: ItemLine[] }) {
  return <>
    <LineTable kind="WORK" lines={works} options={options} />
    <LineTable kind="ITEM" lines={items} options={options} />
  </>;
}

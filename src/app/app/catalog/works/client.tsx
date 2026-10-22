"use client";
// Справочник работ: список групп слева (создать, переименовать, удалить), отметка работ и перенос в группу.
import Link from "next/link";
import { useEffect, useState } from "react";
import { ActionForm, Submit } from "@/components/form";
import { createWorkGroupAction, deleteWorkGroupAction, moveWorksAction, renameWorkGroupAction } from "../../manage-actions";

export type GroupItem = { id: string; name: string; count: number };

const PATH = "/app/catalog/works";
const control = "rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500";
const MOVE_FORM = "works-move";

export function GroupList({
  groups,
  ungrouped,
  total,
  current,
  canCreate,
  canEdit,
  canDelete,
}: {
  groups: GroupItem[];
  ungrouped: number;
  total: number;
  current: string;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [mode, setMode] = useState<{ id: string; kind: "rename" | "delete" } | null>(null);
  const [adding, setAdding] = useState(false);
  // после сохранения список групп приходит заново — закрываем открытую форму
  useEffect(() => {
    setMode(null);
    setAdding(false);
  }, [groups]);

  const item = (key: string, name: string, count: number, extra = "") => (
    <Link
      key={key}
      href={key ? `${PATH}?group=${key}` : PATH}
      className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm lg:rounded-none lg:border-0 lg:border-l-[3px] lg:py-2 ${
        current === key ? "border-blue-500 bg-blue-100 text-blue-700 lg:text-slate-900" : "border-slate-200 hover:bg-slate-50 lg:border-transparent"
      } ${extra}`}
    >
      <span className="min-w-0 flex-1">{name}</span>
      <span className="text-xs text-slate-500 tabular-nums">{count}</span>
    </Link>
  );

  return (
    <nav aria-label="Группы работ" className="flex flex-col gap-1 lg:rounded-md lg:border lg:border-slate-200 lg:bg-white lg:py-2">
      <h2 className="hidden px-4 pt-1 pb-2 text-xs font-semibold tracking-wider text-slate-500 uppercase lg:block">Группы работ</h2>
      <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
        {item("", "Все работы", total, "font-semibold lg:mb-1 lg:border-b lg:border-b-slate-100")}
        {groups.map((g) =>
          mode?.id === g.id ? (
            <div key={g.id} className="flex shrink-0 flex-col gap-2 bg-slate-50 px-3 py-2 text-sm lg:px-4">
              {mode.kind === "rename" ? (
                <ActionForm action={renameWorkGroupAction.bind(null, g.id)} className="flex flex-wrap items-center gap-2">
                  <input name="name" defaultValue={g.name} required autoFocus aria-label="Название группы" className={`${control} min-w-0 flex-1`} />
                  <Submit variant="ghost">OK</Submit>
                  <button type="button" onClick={() => setMode(null)} className="text-slate-500 hover:text-slate-800">
                    Отмена
                  </button>
                </ActionForm>
              ) : (
                <ActionForm action={deleteWorkGroupAction.bind(null, g.id)} className="flex flex-col gap-2">
                  {g.count > 0 ? (
                    <>
                      <span>
                        Удалить «{g.name}»? В ней работ: {g.count}. Перенести их в:
                      </span>
                      <select name="moveTo" required className={control} aria-label="Куда перенести работы">
                        {groups
                          .filter((x) => x.id !== g.id)
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.name}
                            </option>
                          ))}
                      </select>
                    </>
                  ) : (
                    <span>Удалить пустую группу «{g.name}»?</span>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Submit variant="danger">{g.count > 0 ? "Перенести и удалить" : "Удалить"}</Submit>
                    <button type="button" onClick={() => setMode(null)} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50">
                      Отмена
                    </button>
                  </div>
                </ActionForm>
              )}
            </div>
          ) : (
            <div key={g.id} className="group relative flex shrink-0 items-center">
              {item(g.id, g.name, g.count, "flex-1 lg:pr-14 lg:pl-4")}
              {(canEdit || canDelete) && (
                <span className="absolute right-10 hidden gap-1 text-slate-500 lg:group-hover:flex">
                  {canEdit && (
                    <button type="button" onClick={() => setMode({ id: g.id, kind: "rename" })} title="Переименовать" aria-label={`Переименовать «${g.name}»`} className="px-1 hover:text-blue-600">
                      ✎
                    </button>
                  )}
                  {canDelete && (
                    <button type="button" onClick={() => setMode({ id: g.id, kind: "delete" })} title="Удалить" aria-label={`Удалить «${g.name}»`} className="px-1 hover:text-red-600">
                      ✕
                    </button>
                  )}
                </span>
              )}
            </div>
          ),
        )}
        {ungrouped > 0 && item("none", "Без группы", ungrouped, "lg:mt-1 lg:border-t lg:border-t-slate-100 lg:pl-4")}
      </div>
      {canCreate &&
        (adding ? (
          <ActionForm action={createWorkGroupAction} className="flex flex-wrap items-center gap-2 px-0 lg:px-4">
            <input name="name" required autoFocus placeholder="Название группы" aria-label="Название новой группы" className={`${control} min-w-0 flex-1`} />
            <Submit>OK</Submit>
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-slate-500 hover:text-slate-800">
              Отмена
            </button>
          </ActionForm>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="self-start px-0 py-1 text-sm text-blue-600 hover:underline lg:px-4">
            + Добавить группу
          </button>
        ))}
      {(canEdit || canDelete) && groups.length > 0 && (
        <p className="hidden px-4 pt-1 text-xs text-slate-500 lg:block">✎ и ✕ появляются при наведении на группу.</p>
      )}
    </nav>
  );
}

/** Галочка строки: отмечает работу для переноса в другую группу. */
export function WorkCheck({ id, label }: { id: string; label: string }) {
  return <input type="checkbox" name="ids" value={id} form={MOVE_FORM} aria-label={`Отметить: ${label}`} className="h-4 w-4" />;
}

const checks = () => [...document.querySelectorAll<HTMLInputElement>(`input[form="${MOVE_FORM}"][name="ids"]`)];

/** Галочка в шапке: отметить все работы на странице. */
export function CheckAll() {
  return (
    <input
      type="checkbox"
      aria-label="Отметить все на странице"
      className="h-4 w-4"
      onChange={(e) => {
        checks().forEach((c) => (c.checked = e.target.checked));
        document.dispatchEvent(new Event("works-checked"));
      }}
    />
  );
}

/** Панель «Отмечено: N. Перенести в группу …», появляется, когда отмечена хоть одна работа. */
export function MoveBar({ groups }: { groups: GroupItem[] }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    // после переноса форма сбрасывается вместе с галочками; reset срабатывает до сброса, считаем следом
    const count = () => setTimeout(() => setN(checks().filter((c) => c.checked).length));
    const events = ["change", "reset", "works-checked"];
    events.forEach((e) => document.addEventListener(e, count));
    return () => events.forEach((e) => document.removeEventListener(e, count));
  }, []);
  return (
    <div hidden={n === 0} className="mb-3 rounded-md bg-blue-50 p-2">
      <ActionForm id={MOVE_FORM} action={moveWorksAction} reset className="flex flex-wrap items-center gap-2 text-sm">
        <span id={MOVE_FORM + "-label"}>Отмечено: {n}. Перенести в группу</span>
        <select name="groupId" required className={control} aria-labelledby={MOVE_FORM + "-label"}>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <Submit>Перенести</Submit>
        <button
          type="button"
          onClick={() => {
            checks().forEach((c) => (c.checked = false));
            document.dispatchEvent(new Event("works-checked"));
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          Снять отметку
        </button>
      </ActionForm>
    </div>
  );
}

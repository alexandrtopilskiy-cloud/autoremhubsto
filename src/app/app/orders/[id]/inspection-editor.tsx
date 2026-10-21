"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { CarScheme, HAND_FONT } from "@/components/car-scheme";
import { damageCode, damageTag, damageText, EXTRA_ZONES, SIZES, zoneLabel, type Damage } from "@/lib/car-body";
import { addDamageAction, removeDamageAction, updateDamageAction, type DamageInput } from "../actions";
import type { FormState } from "@/lib/actions";

const SIZE_KEYS = [1, 2, 3] as const;

function Code({ type, size, className = "" }: { type: string; size?: number | null; className?: string }) {
  return (
    <b className={`text-red-600 ${className}`} style={{ fontFamily: HAND_FONT }}>
      {damageTag({ type, size })}
    </b>
  );
}

function SizePicker({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const btn = (on: boolean) => `px-2.5 py-1 text-xs ${on ? "bg-blue-600 text-white" : "bg-white hover:bg-slate-50"}`;
  return (
    <div className="inline-flex divide-x divide-slate-300 overflow-hidden rounded-md border border-slate-300">
      <button type="button" className={btn(value === null)} onClick={() => onChange(null)}>
        без размера
      </button>
      {SIZE_KEYS.map((n) => (
        <button key={n} type="button" className={btn(value === n)} onClick={() => onChange(n)} title={SIZES[n]}>
          {n} · {SIZES[n]}
        </button>
      ))}
    </div>
  );
}

/** Развёртка кузова в акте осмотра: выбрал код — ткнул в место; нажатие на код открывает его правку. */
export function InspectionEditor({ orderId, damages, types, readOnly }: { orderId: string; damages: Damage[]; types: string[]; readOnly: boolean }) {
  const [type, setType] = useState(types[0] ?? "");
  const [size, setSize] = useState<number | null>(null);
  const [sel, setSel] = useState(-1);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const call = (fn: () => Promise<FormState>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      setError(res?.error);
      if (!res?.error) after?.();
    });

  const add = (input: DamageInput) => {
    if (!type) return setError("Добавьте виды повреждений в справочник");
    call(() => addDamageAction(orderId, { ...input, type, size }));
  };

  function onSheet(e: MouseEvent<HTMLDivElement>) {
    const t = e.target as Element;
    const mark = t.closest("[data-mark]");
    if (mark) return setSel(Number(mark.getAttribute("data-mark")));
    const zone = t.closest("[data-zone]")?.getAttribute("data-zone");
    if (!zone || readOnly) return setSel(-1);
    const svg = e.currentTarget.querySelector("svg")!;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
    setSel(-1);
    add({ zone, x: Math.round(p.x), y: Math.round(p.y) });
  }

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex flex-col gap-2 lg:w-[400px] lg:shrink-0">
        {!readOnly && (
          <>
            <div className="flex flex-wrap gap-1.5">
              {types.map((t) => {
                const { name } = damageCode(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setType(t);
                      setSize(null);
                    }}
                    className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${t === type ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white hover:bg-slate-50"}`}
                  >
                    <Code type={t} className="text-base leading-none" />
                    {name}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              Размер <SizePicker value={size} onChange={setSize} />
            </div>
          </>
        )}
        <div onClick={onSheet} className={`border border-slate-300 bg-white p-2 ${pending ? "opacity-60" : ""}`}>
          <CarScheme damages={damages} selected={sel} interactive={!readOnly} className="mx-auto w-full max-w-[380px]" />
        </div>
        {!readOnly && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Ткните в место на кузове, код встанет туда. Вне схемы:
            {EXTRA_ZONES.filter((z) => z.key === "interior").map((z) => (
              <button
                key={z.key}
                type="button"
                onClick={() => add({ zone: z.key })}
                className="rounded-md border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
              >
                {z.label}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {damages.length === 0 && <p className="text-sm text-slate-500">Повреждений не отмечено</p>}
        <ol className="flex flex-col gap-1.5">
          {damages.map((d, i) => (
            <li key={i} className={`rounded-md border px-2 py-1.5 text-sm ${i === sel ? "border-blue-400 bg-blue-50/50" : "border-slate-200"}`}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setSel(i === sel ? -1 : i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Code type={d.type} size={d.size} className="w-9 shrink-0 text-xl leading-none" />
                  <span className="min-w-0">
                    {zoneLabel(d.zone)}
                    <span className="block text-xs text-slate-500">{damageText(d)}</span>
                  </span>
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className="px-1 text-red-600 hover:underline"
                    title="Убрать"
                    onClick={() =>
                      call(
                        () => removeDamageAction(orderId, i),
                        () => setSel(-1),
                      )
                    }
                  >
                    ✕
                  </button>
                )}
              </div>
              {i === sel && !readOnly && (
                <DamageEdit
                  key={`${i}-${d.type}-${d.size}-${d.note}`}
                  damage={d}
                  types={types}
                  onSave={(v) =>
                    call(
                      () => updateDamageAction(orderId, i, v),
                      () => setSel(-1),
                    )
                  }
                />
              )}
            </li>
          ))}
        </ol>
        <details className="text-xs text-slate-600">
          <summary className="cursor-pointer text-slate-500">Расшифровка кодов</summary>
          <table className="mt-1">
            <tbody>
              {types.map((t) => (
                <tr key={t}>
                  <td className="pr-3">
                    <Code type={t} className="text-base" />
                  </td>
                  <td>{damageCode(t).name}</td>
                </tr>
              ))}
              <tr>
                <td className="pr-3 align-top whitespace-nowrap text-slate-500">1–3</td>
                <td>размер: {SIZE_KEYS.map((n) => `${n} — ${SIZES[n]}`).join(", ")}</td>
              </tr>
            </tbody>
          </table>
        </details>
      </div>
    </div>
  );
}

function DamageEdit({ damage, types, onSave }: { damage: Damage; types: string[]; onSave: (v: DamageInput) => void }) {
  const [type, setType] = useState(damage.type);
  const [size, setSize] = useState<number | null>(damage.size ?? null);
  const [note, setNote] = useState(damage.note ?? "");
  const options = types.includes(damage.type) ? types : [damage.type, ...types];
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-2">
      <div className="flex flex-wrap items-center gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm">
          {options.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <SizePicker value={size} onChange={setSize} />
      </div>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Уточнение, например «у ручки»"
          className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-sm"
        />
        <button type="button" onClick={() => onSave({ type, size, note })} className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700">
          Сохранить
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Field, Input } from "@/components/ui";
import { CAR_SPEC_KEYS, type CarModRow, type CarSpecKey } from "@/lib/car-spec";

type Values = Partial<Record<"make" | "model" | "year" | CarSpecKey, string | number | null>>;

const LABELS: Record<CarSpecKey, string> = {
  body: "Кузов (поколение)",
  engineType: "Тип двигателя",
  engineVolume: "Объём двигателя, л",
  power: "Мощность, л.с.",
  engineCode: "Индекс двигателя",
  transmission: "Вид трансмиссии",
  drive: "Тип привода",
};
const FIELDS = ["make", "model", "year", ...CAR_SPEC_KEYS] as const;

const norm = (s: string) => s.trim().toLowerCase().replace(",", ".");
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const fitsYear = (r: CarModRow, y: number) => (r.yearFrom ?? 0) <= y && y <= (r.yearTo ?? 9999);

/**
 * Марка, модель, год и параметры автомобиля с подсказками из справочника автомобилей.
 * В каждом поле подсказываются варианты, подходящие к уже заполненным полям; если вариант один, поле заполняется само.
 * Значение не из справочника вписать можно: тогда параметры заполняются вручную.
 */
export function CarSpecFields({
  v,
  catalog,
  fallback,
}: {
  v: Values;
  catalog: Record<string, string[]>;
  fallback: Partial<Record<CarSpecKey, string[]>>;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((k) => [k, v[k] === null || v[k] === undefined ? "" : String(v[k])])),
  );
  const [rows, setRows] = useState<CarModRow[] | null>(null);
  const auto = useRef(new Set<CarSpecKey>());
  const cache = useRef(new Map<string, CarModRow[]>());

  const makeKey = Object.keys(catalog).find((m) => sameName(m, vals.make));
  const modelKey = makeKey ? catalog[makeKey].find((m) => sameName(m, vals.model)) : undefined;

  const input = (name: string) => box.current?.closest("form")?.elements.namedItem(name) as HTMLInputElement | null;
  const read = () => Object.fromEntries(FIELDS.map((k) => [k, input(k)?.value ?? ""]));

  // модификации выбранной модели подгружаются с сервера
  useEffect(() => {
    if (!makeKey || !modelKey) return setRows(null);
    const key = `${makeKey}|${modelKey}`;
    const hit = cache.current.get(key);
    if (hit) return setRows(hit);
    let live = true;
    fetch(`/app/clients/car-specs?make=${encodeURIComponent(makeKey)}&model=${encodeURIComponent(modelKey)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: CarModRow[]) => {
        cache.current.set(key, list);
        if (live) setRows(list);
      })
      .catch(() => live && setRows(null));
    return () => {
      live = false;
    };
  }, [makeKey, modelKey]);

  const matches = (r: CarModRow, cur: Record<string, string>, skip?: CarSpecKey) =>
    (!parseInt(cur.year, 10) || fitsYear(r, parseInt(cur.year, 10))) &&
    CAR_SPEC_KEYS.every((k) => k === skip || !cur[k] || norm(r[k]) === norm(cur[k]));

  /** Поля, которые однозначно следуют из заполненных, заполняются сами; их же очищаем, когда пользователь меняет другое поле. */
  function autofill(list: CarModRow[] | null, changed?: string) {
    if (changed) {
      auto.current.delete(changed as CarSpecKey);
      for (const k of auto.current) {
        const el = input(k);
        if (el) el.value = "";
      }
      auto.current.clear();
    }
    const cur = read();
    if (list && changed) {
      const ok = list.filter((r) => matches(r, cur));
      for (const k of CAR_SPEC_KEYS) {
        const opts = new Set(ok.map((r) => r[k]));
        const el = input(k);
        if (!cur[k] && opts.size === 1 && el) {
          el.value = [...opts][0];
          cur[k] = el.value;
          auto.current.add(k);
        }
      }
    }
    setVals(cur);
  }

  // заполнение после подгрузки модификаций (марку и модель только что выбрали)
  const pending = useRef<string | null>(null);
  useEffect(() => {
    if (rows && pending.current) {
      autofill(rows, pending.current);
      pending.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  // слушаем нативные события: поле VIN подставляет марку и год прямо в форму
  useEffect(() => {
    const el = box.current?.closest("form");
    if (!el) return;
    const on = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (!FIELDS.includes(t.name as (typeof FIELDS)[number])) return;
      if (t.name === "make" || t.name === "model") pending.current = t.name;
      autofill(rows, t.name);
    };
    el.addEventListener("input", on);
    return () => el.removeEventListener("input", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const options = useMemo(() => {
    const out = {} as Record<CarSpecKey, { value: string; label?: string }[]>;
    for (const k of CAR_SPEC_KEYS) {
      if (!rows) {
        out[k] = (fallback[k] ?? []).map((value) => ({ value }));
        continue;
      }
      const seen = new Map<string, string>();
      for (const r of rows.filter((r) => matches(r, vals, k))) {
        if (k !== "body") seen.set(r[k], "");
        else {
          const years = [r.yearFrom, r.yearTo].filter(Boolean).join("–");
          const prev = seen.get(r.body);
          if (!prev?.split(", ").includes(years)) seen.set(r.body, prev ? `${prev}, ${years}` : years);
        }
      }
      out[k] = [...seen.entries()]
        .filter(([value]) => value)
        .sort(([a], [b]) => a.localeCompare(b, "ru", { numeric: true }))
        .map(([value, label]) => ({ value, label: label || undefined }));
    }
    return out;
  }, [rows, vals, fallback]);

  const left = rows ? rows.filter((r) => matches(r, vals)).length : 0;
  let status: React.ReactNode = null;
  if (vals.make && !makeKey) status = <span className="text-amber-700">Марки нет в справочнике — параметры вводятся вручную.</span>;
  else if (makeKey && vals.model && !modelKey)
    status = <span className="text-amber-700">Модели нет в справочнике — параметры вводятся вручную.</span>;
  else if (rows)
    status = left ? (
      <span className="text-slate-500">Подходит модификаций из справочника: {left}</span>
    ) : (
      <span className="text-amber-700">В справочнике нет модификации с такими параметрами.</span>
    );

  function clearSpecs() {
    for (const k of CAR_SPEC_KEYS) {
      const el = input(k);
      if (el) el.value = "";
    }
    auto.current.clear();
    setVals(read());
  }

  return (
    <div ref={box} className="contents">
      <Field label="Марка">
        <Input name="make" list="car-makes" defaultValue={vals.make} required autoComplete="off" />
        <datalist id="car-makes">
          {Object.keys(catalog).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label="Модель">
        <Input name="model" list="car-models" defaultValue={vals.model} required autoComplete="off" />
        <datalist id="car-models">
          {(makeKey ? catalog[makeKey] : []).map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
      </Field>
      <Field label="Год выпуска">
        <Input name="year" type="number" min={1900} max={2100} defaultValue={vals.year} />
      </Field>
      {CAR_SPEC_KEYS.map((k) => (
        <Field key={k} label={LABELS[k]}>
          <Input
            name={k}
            list={`car-${k}`}
            defaultValue={vals[k]}
            autoComplete="off"
            inputMode={k === "power" ? "numeric" : k === "engineVolume" ? "decimal" : undefined}
            placeholder={rows && !vals[k] && options[k].length ? `вариантов: ${options[k].length}` : undefined}
          />
          <datalist id={`car-${k}`}>
            {options[k].map((o) => (
              <option key={o.value} value={o.value} label={o.label} />
            ))}
          </datalist>
        </Field>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm sm:col-span-2 lg:col-span-4">
        {status ?? <span />}
        {rows && (
          <button type="button" onClick={clearSpecs} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 hover:bg-slate-50">
            Очистить параметры
          </button>
        )}
      </div>
    </div>
  );
}

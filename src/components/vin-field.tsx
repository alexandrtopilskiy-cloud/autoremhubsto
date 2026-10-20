"use client";

import { useState } from "react";
import { decodeVin, type VinInfo } from "@/lib/vin";

/** Поле VIN: после ввода расшифровывает его и подставляет марку и год в пустые поля той же формы. */
export function VinField({ defaultValue }: { defaultValue?: string }) {
  const [info, setInfo] = useState<VinInfo | null>(null);

  function decode(input: HTMLInputElement) {
    if (!input.value.trim()) return setInfo(null);
    const d = decodeVin(input.value);
    setInfo(d);
    if (!d.ok) return;
    input.value = d.vin;
    const form = input.form;
    const fill = (name: string, value?: string | number) => {
      const el = form?.elements.namedItem(name);
      if (value !== undefined && el instanceof HTMLInputElement && !el.value) el.value = String(value);
    };
    fill("make", d.make);
    fill("year", d.year);
  }

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-slate-600">VIN</span>
      <input
        name="vin"
        defaultValue={defaultValue}
        maxLength={20}
        onBlur={(e) => decode(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            decode(e.currentTarget);
          }
        }}
        className="w-52 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm uppercase outline-none focus:border-blue-500"
        aria-describedby="vin-hint"
      />
      <span id="vin-hint" className={`min-h-4 text-xs ${info && !info.ok ? "text-red-600" : "text-slate-500"}`} aria-live="polite">
        {info &&
          (info.ok
            ? [info.make ?? "марка не определена", info.country, info.year && `${info.year} г.`, info.warning].filter(Boolean).join(" · ")
            : info.error)}
      </span>
    </label>
  );
}

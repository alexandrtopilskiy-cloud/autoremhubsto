"use client";
// Ячейка списка с перечнем через запятую: показываем то, что помещается в lines строк,
// дальше — «… ещё X …», где X — сколько всего в перечне. Пересчитывается при изменении ширины (панель просмотра, окно).
// min-w не даёт столбцу таблицы сжиматься от того, что мы сами спрятали часть перечня.
import { useLayoutEffect, useRef } from "react";

/** «автомобиль / автомобиля / автомобилей» по числу */
export function plural(n: number, [one, few, many]: [string, string, string]) {
  const d = n % 10;
  const dd = n % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

export function ClampList({ items, lines = 3, words }: { items: string[]; lines?: number; words: [string, string, string] }) {
  const box = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const parts = Array.from(el.querySelectorAll<HTMLElement>("[data-item]"));
    const tail = el.querySelector<HTMLElement>("[data-tail]")!;
    const fit = () => {
      const max = parseFloat(getComputedStyle(el).lineHeight) * lines + 1;
      parts.forEach((p) => (p.style.display = ""));
      tail.style.display = "none";
      if (el.offsetHeight <= max) return;
      tail.style.display = "";
      for (let shown = parts.length - 1; shown >= 1; shown--) {
        parts[shown].style.display = "none";
        tail.textContent = ` … ещё ${parts.length} ${plural(parts.length, words)}`;
        if (el.offsetHeight <= max) return;
      }
    };
    fit();
    // реагируем только на ширину: высота меняется от самого пересчёта
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.join("\n"), lines, words.join()]);

  return (
    <div ref={box} className="min-w-64">
      {items.map((s, i) => (
        <span key={i} data-item>
          {i > 0 && ", "}
          {s}
        </span>
      ))}
      <span data-tail className="text-slate-500" style={{ display: "none" }} />
    </div>
  );
}

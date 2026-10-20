import { Input, Select } from "@/components/ui";

type P = {
  id: string;
  name: string;
  article: string | null;
  brand: string | null;
  group?: { name: string } | null;
};

const label = (p: P) => [p.name, p.article, p.brand].filter(Boolean).join(" · ");

/**
 * Выбор товара из справочника для строк складских документов: из списка по группам или по штрихкоду.
 * Сканер вводит код и Enter — форма сразу добавляет строку.
 */
export function ProductSelect({ products }: { products: P[] }) {
  const groups = new Map<string, P[]>();
  for (const p of products) {
    const g = p.group?.name ?? "";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }
  const named = [...groups.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, "ru"));
  return (
    <div className="flex gap-2">
      <Select name="productId" defaultValue="" className="min-w-0 flex-1">
        <option value="">Выберите товар</option>
        {named.length === 0
          ? products.map((p) => (
              <option key={p.id} value={p.id}>
                {label(p)}
              </option>
            ))
          : [...named, ""]
              .filter((g) => groups.has(g))
              .map((g) => (
                <optgroup key={g || "-"} label={g || "Без группы"}>
                  {groups.get(g)!.map((p) => (
                    <option key={p.id} value={p.id}>
                      {label(p)}
                    </option>
                  ))}
                </optgroup>
              ))}
      </Select>
      <Input name="barcode" placeholder="или штрихкод" className="w-36" aria-label="Штрихкод" autoComplete="off" />
    </div>
  );
}

export const docStatus = (posted: boolean) => (posted ? "Проведён" : "Черновик");

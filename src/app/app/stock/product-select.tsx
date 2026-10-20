import { Select } from "@/components/ui";

type P = {
  id: string;
  name: string;
  article: string | null;
  brand: string | null;
};

/** Выбор товара из справочника для строк складских документов. */
export function ProductSelect({ products }: { products: P[] }) {
  return (
    <Select name="productId" defaultValue="">
      <option value="">Выберите товар</option>
      {products.map((p) => (
        <option key={p.id} value={p.id}>
          {[p.name, p.article, p.brand].filter(Boolean).join(" · ")}
        </option>
      ))}
    </Select>
  );
}

export const docStatus = (posted: boolean) => (posted ? "Проведён" : "Черновик");

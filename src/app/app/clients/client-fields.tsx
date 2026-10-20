import { Field, Input, Select } from "@/components/ui";

type C = {
  kind?: string;
  name?: string;
  phone?: string | null;
  email?: string | null;
  inn?: string | null;
  discount?: number;
  priceCategoryId?: string | null;
  source?: string | null;
  comment?: string | null;
};

export function ClientFields({
  c = {},
  categories = [],
  sources = [],
}: {
  c?: C;
  categories?: { id: string; name: string }[];
  sources?: string[];
}) {
  return (
    <>
      <Field label="Тип">
        <Select name="kind" defaultValue={c.kind ?? "PERSON"}>
          <option value="PERSON">Физлицо</option>
          <option value="ENTREPRENEUR">ИП</option>
          <option value="LEGAL">Юрлицо</option>
        </Select>
      </Field>
      <Field label="ФИО или название" className="min-w-56 flex-1">
        <Input name="name" defaultValue={c.name} required />
      </Field>
      <Field label="Телефон">
        <Input name="phone" type="tel" defaultValue={c.phone ?? ""} />
      </Field>
      <Field label="Email">
        <Input name="email" type="email" defaultValue={c.email ?? ""} />
      </Field>
      <Field label="ИНН">
        <Input name="inn" defaultValue={c.inn ?? ""} />
      </Field>
      <Field label="Скидка, %">
        <Input name="discount" type="number" min={0} max={100} defaultValue={c.discount ?? 0} className="w-24" />
      </Field>
      {categories.length > 0 && (
        <Field label="Категория цен">
          <Select name="priceCategoryId" defaultValue={c.priceCategoryId ?? ""}>
            <option value="">Базовые цены</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Откуда узнал">
        <Input name="source" list="client-sources" defaultValue={c.source ?? ""} />
        <datalist id="client-sources">
          {sources.map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
      </Field>
      <Field label="Комментарий" className="w-full">
        <Input name="comment" defaultValue={c.comment ?? ""} />
      </Field>
    </>
  );
}

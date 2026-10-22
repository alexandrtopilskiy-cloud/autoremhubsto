import { Field, Input, Select } from "@/components/ui";
import { DictList } from "@/components/dict-list";
import { VinField } from "@/components/vin-field";
import { GENDERS, VEHICLE_LISTS } from "@/lib/services/clients";

const grid = "grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4";
const wide = "sm:col-span-2 lg:col-span-4";
const rubInput = (kop: number | null | undefined) => (kop ? (kop / 100).toString().replace(".", ",") : "");

type C = {
  kind?: string;
  name?: string;
  email?: string | null;
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legalAddress?: string | null;
  actualAddress?: string | null;
  postalAddress?: string | null;
  discount?: number;
  partsDiscount?: number;
  hourPrice?: number | null;
  priceCategoryId?: string | null;
  source?: string | null;
  comment?: string | null;
};

/** Вкладка «Основное»: реквизиты, цены и скидки. */
export function ClientFields({
  c = {},
  categories = [],
  sources = [],
  nameHint,
}: {
  c?: C;
  categories?: { id: string; name: string }[];
  sources?: string[];
  nameHint?: string;
}) {
  return (
    <>
      <div className={grid}>
        <Field label="Тип клиента">
          <Select name="kind" defaultValue={c.kind ?? "PERSON"}>
            <option value="PERSON">ФЛ — физлицо</option>
            <option value="ENTREPRENEUR">ИП</option>
            <option value="LEGAL">ЮЛ — организация</option>
          </Select>
        </Field>
        <Field label="Наименование для документов" className="sm:col-span-1 lg:col-span-3">
          <Input name="name" defaultValue={c.name} required={!nameHint} placeholder={nameHint} />
        </Field>
        <Field label="ИНН">
          <Input name="inn" defaultValue={c.inn ?? ""} inputMode="numeric" />
        </Field>
        <Field label="КПП">
          <Input name="kpp" defaultValue={c.kpp ?? ""} inputMode="numeric" />
        </Field>
        <Field label="ОГРН">
          <Input name="ogrn" defaultValue={c.ogrn ?? ""} inputMode="numeric" />
        </Field>
        <Field label="Email">
          <Input name="email" type="email" defaultValue={c.email ?? ""} />
        </Field>
        <Field label="Юридический адрес" className={wide}>
          <Input name="legalAddress" defaultValue={c.legalAddress ?? ""} />
        </Field>
        <Field label="Фактический адрес" className={wide}>
          <Input name="actualAddress" defaultValue={c.actualAddress ?? ""} />
        </Field>
        <Field label="Почтовый адрес" className={wide}>
          <Input name="postalAddress" defaultValue={c.postalAddress ?? ""} />
        </Field>
      </div>
      <h3 className="mt-2 w-full font-semibold">Цены и скидки</h3>
      <div className={grid}>
        <Field label="Категория цены на товары">
          <Select name="priceCategoryId" defaultValue={c.priceCategoryId ?? ""}>
            <option value="">Базовые цены</option>
            {categories.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Скидка на товары, %">
          <Input name="partsDiscount" type="number" min={0} max={100} defaultValue={c.partsDiscount ?? 0} />
        </Field>
        <Field label="Стоимость нормочаса, ₽">
          <Input name="hourPrice" inputMode="decimal" defaultValue={rubInput(c.hourPrice)} placeholder="по категории или СТО" />
        </Field>
        <Field label="Скидка на работы, %">
          <Input name="discount" type="number" min={0} max={100} defaultValue={c.discount ?? 0} />
        </Field>
      </div>
      <div className={grid}>
        <Field label="Откуда узнал">
          <Input name="source" list="client-sources" defaultValue={c.source ?? ""} />
          <datalist id="client-sources">
            {sources.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </Field>
        <Field label="Комментарий" className="sm:col-span-1 lg:col-span-3">
          <Input name="comment" defaultValue={c.comment ?? ""} />
        </Field>
      </div>
    </>
  );
}

type Contact = {
  lastName?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  gender?: string | null;
  phone?: string | null;
  note?: string | null;
};

/** Поля контакта; prefix нужен, когда контакт в одной форме с клиентом. */
export function ContactFields({ c = {}, prefix = "" }: { c?: Contact; prefix?: string }) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Field label="Фамилия">
        <Input name={`${prefix}lastName`} defaultValue={c.lastName ?? ""} />
      </Field>
      <Field label="Имя">
        <Input name={`${prefix}firstName`} defaultValue={c.firstName ?? ""} />
      </Field>
      <Field label="Отчество">
        <Input name={`${prefix}middleName`} defaultValue={c.middleName ?? ""} />
      </Field>
      <Field label="Пол">
        <Select name={`${prefix}gender`} defaultValue={c.gender ?? ""}>
          <option value="">—</option>
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Телефон">
        <Input name={`${prefix}phone`} type="tel" defaultValue={c.phone ?? ""} />
      </Field>
      <Field label="Примечание">
        <Input name={`${prefix}note`} defaultValue={c.note ?? ""} />
      </Field>
    </div>
  );
}

export function BankAccountFields({ b = {} }: { b?: { bik?: string | null; account?: string | null; note?: string | null } }) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-[10rem_16rem_1fr]">
      <Field label="БИК">
        <Input name="bik" defaultValue={b.bik ?? ""} inputMode="numeric" maxLength={9} />
      </Field>
      <Field label="Расчётный счёт">
        <Input name="account" defaultValue={b.account ?? ""} inputMode="numeric" maxLength={20} />
      </Field>
      <Field label="Примечание">
        <Input name="note" defaultValue={b.note ?? ""} />
      </Field>
    </div>
  );
}

type Vehicle = {
  vin?: string | null;
  frame?: string | null;
  make?: string;
  model?: string;
  plate?: string | null;
  year?: number | null;
  body?: string | null;
  color?: string | null;
  engineType?: string | null;
  engineCode?: string | null;
  power?: number | null;
  engineVolume?: string | null;
  transmission?: string | null;
  drive?: string | null;
  note?: string | null;
};

/** Все поля автомобиля из выгрузки АвтоДилера плюс цвет. */
export function VehicleFields({ v = {}, colors = [] }: { v?: Vehicle; colors?: string[] }) {
  return (
    <div className={grid}>
      <VinField defaultValue={v.vin ?? undefined} />
      <Field label="Frame (номер кузова)">
        <Input name="frame" defaultValue={v.frame ?? ""} />
      </Field>
      <Field label="Марка">
        <Input name="make" defaultValue={v.make ?? ""} required />
      </Field>
      <Field label="Модель">
        <Input name="model" defaultValue={v.model ?? ""} required />
      </Field>
      <Field label="Госномер">
        <Input name="plate" defaultValue={v.plate ?? ""} />
      </Field>
      <Field label="Год выпуска">
        <Input name="year" type="number" min={1900} max={2100} defaultValue={v.year ?? ""} />
      </Field>
      <Field label="Кузов">
        <Input name="body" list="car-bodies" defaultValue={v.body ?? ""} />
        <DictList id="car-bodies" items={VEHICLE_LISTS.body} />
      </Field>
      <Field label="Цвет">
        <Input name="color" list="car-colors" defaultValue={v.color ?? ""} />
        <DictList id="car-colors" items={colors} />
      </Field>
      <Field label="Тип двигателя">
        <Input name="engineType" list="car-engines" defaultValue={v.engineType ?? ""} />
        <DictList id="car-engines" items={VEHICLE_LISTS.engineType} />
      </Field>
      <Field label="Индекс двигателя">
        <Input name="engineCode" defaultValue={v.engineCode ?? ""} />
      </Field>
      <Field label="Мощность, л.с.">
        <Input name="power" type="number" min={1} max={5000} defaultValue={v.power ?? ""} />
      </Field>
      <Field label="Объём двигателя, л">
        <Input name="engineVolume" inputMode="decimal" defaultValue={v.engineVolume ?? ""} />
      </Field>
      <Field label="Вид трансмиссии">
        <Input name="transmission" list="car-gearboxes" defaultValue={v.transmission ?? ""} />
        <DictList id="car-gearboxes" items={VEHICLE_LISTS.transmission} />
      </Field>
      <Field label="Тип привода">
        <Input name="drive" list="car-drives" defaultValue={v.drive ?? ""} />
        <DictList id="car-drives" items={VEHICLE_LISTS.drive} />
      </Field>
      <Field label="Примечание" className="sm:col-span-2">
        <Input name="note" defaultValue={v.note ?? ""} />
      </Field>
    </div>
  );
}

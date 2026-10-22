import Link from "next/link";
import { Card, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { carCatalogInfo, carMakes, carModifications } from "@/lib/services/car-catalog";
import { CatalogTabs } from "../tabs";

const PATH = "/app/catalog/cars";
/** Выгрузка — файлом, поэтому обычной ссылкой, а не переходом внутри приложения. */
const EXPORT = "/app/excel/cars";
const btn = "rounded-md border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50";
const item = "flex justify-between gap-2 border-l-[3px] px-3 py-1.5 text-sm";
const n = (x: number) => x.toLocaleString("ru-RU");

export default async function CarsPage({ searchParams }: { searchParams: Promise<{ make?: string; model?: string; q?: string }> }) {
  const s = await requireSession();
  const sp = await searchParams;
  const [info, makes] = await Promise.all([carCatalogInfo(s.companyId), carMakes(s.companyId)]);
  const make = makes.find((m) => m.make === sp.make) ?? makes[0];
  const q = (sp.q ?? "").trim().toLowerCase();
  const models = make ? make.models.filter((m) => m.model.toLowerCase().includes(q)) : [];
  const model = make?.models.find((m) => m.model === sp.model) ?? models[0];
  const rows = make && model ? await carModifications(s.companyId, make.make, model.model) : [];
  // кузова в порядке годов, внутри — модификации
  const bodies = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = `${r.body}|${r.yearFrom ?? ""}|${r.yearTo ?? ""}`;
    if (!bodies.has(k)) bodies.set(k, []);
    bodies.get(k)!.push(r);
  }
  const href = (m: string, mo?: string) =>
    `${PATH}?make=${encodeURIComponent(m)}${mo ? `&model=${encodeURIComponent(mo)}` : ""}${sp.q && mo ? `&q=${encodeURIComponent(sp.q)}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <div className="flex flex-wrap gap-2">
            {info.rows > 0 && (
              <a href={EXPORT} className={btn}>
                Выгрузить в Excel
              </a>
            )}
            {can(s.perms, "catalog", "CREATE") && (
              <Link href="/app/excel#cars" className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Загрузить новый файл
              </Link>
            )}
          </div>
        }
      >
        Справочники
      </PageTitle>
      <CatalogTabs active="cars" />
      {info.rows === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Справочник пуст. Загрузите файл «Справочник ТС» через «Загрузка из Excel» — после этого марки, модели и параметры двигателя
            будут подсказываться в карточке автомобиля клиента.
          </p>
        </Card>
      ) : (
        <>
          <p className="text-sm text-slate-600">
            Загружено {formatDate(info.loadedAt)}: <b>{n(info.makes)}</b> марок, <b>{n(info.models)}</b> моделей, <b>{n(info.rows)}</b>{" "}
            модификаций. Новый файл заменяет справочник целиком; автомобили клиентов при этом не меняются.
          </p>
          <div className="grid items-start gap-3 md:grid-cols-[13rem_15rem_minmax(0,1fr)]">
            <section className="rounded-md border border-slate-200 bg-white">
              <h2 className="border-b px-3 py-2 text-[13px] font-semibold text-slate-500">Марки</h2>
              <div className="max-h-[36rem] overflow-y-auto">
                {makes.map((m) => (
                  <Link
                    key={m.make}
                    href={href(m.make)}
                    scroll={false}
                    className={`${item} ${m.make === make?.make ? "border-blue-500 bg-blue-50 font-semibold" : "border-transparent hover:bg-slate-50"}`}
                  >
                    <span>{m.make}</span>
                    <span className="font-normal text-slate-500 tabular-nums">{m.models.length}</span>
                  </Link>
                ))}
              </div>
            </section>
            <section className="rounded-md border border-slate-200 bg-white">
              <h2 className="border-b px-3 py-2 text-[13px] font-semibold text-slate-500">Модели</h2>
              <form className="p-2">
                {make && <input type="hidden" name="make" value={make.make} />}
                <input
                  name="q"
                  defaultValue={sp.q}
                  placeholder="Поиск модели"
                  aria-label="Поиск модели"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500"
                />
              </form>
              <div className="max-h-[33rem] overflow-y-auto">
                {models.map((m) => (
                  <Link
                    key={m.model}
                    href={href(make!.make, m.model)}
                    scroll={false}
                    className={`${item} ${m.model === model?.model ? "border-blue-500 bg-blue-50 font-semibold" : "border-transparent hover:bg-slate-50"}`}
                  >
                    <span>{m.model}</span>
                    <span className="font-normal text-slate-500 tabular-nums">{m.count}</span>
                  </Link>
                ))}
                {models.length === 0 && <p className="px-3 py-2 text-sm text-slate-500">Не найдено</p>}
              </div>
            </section>
            <section className="min-w-0 rounded-md border border-slate-200 bg-white">
              <h2 className="border-b px-3 py-2 text-[13px] font-semibold text-slate-500">
                {make && model ? `${make.make} ${model.model} — кузова и модификации` : "Кузова и модификации"}
              </h2>
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-sm whitespace-nowrap tabular-nums">
                  <thead className="sticky top-0 bg-white">
                    <tr className="border-b">
                      <th className={th}>Тип двигателя</th>
                      <th className={th}>Объём, л</th>
                      <th className={th}>Мощность, л.с.</th>
                      <th className={th}>Индекс двигателя</th>
                      <th className={th}>Трансмиссия</th>
                      <th className={th}>Привод</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...bodies.entries()].map(([k, list]) => (
                      <BodyRows key={k} list={list} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function BodyRows({ list }: { list: Awaited<ReturnType<typeof carModifications>> }) {
  const b = list[0];
  const years = [b.yearFrom, b.yearTo].filter(Boolean).join("–");
  return (
    <>
      <tr className="border-b bg-slate-50">
        <td className={`${td} font-semibold`} colSpan={6}>
          Кузов {b.body || "—"}
          {years && ` · ${years}`} · {list.length} мод.
        </td>
      </tr>
      {list.map((r, i) => (
        <tr key={i} className="border-b last:border-0">
          <td className={td}>{r.engineType}</td>
          <td className={td}>{r.engineVolume}</td>
          <td className={td}>{r.power}</td>
          <td className={td}>{r.engineCode}</td>
          <td className={td}>{r.transmission}</td>
          <td className={td}>{r.drive}</td>
        </tr>
      ))}
    </>
  );
}

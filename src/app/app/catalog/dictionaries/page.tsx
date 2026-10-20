import { ActionForm, Submit } from "@/components/form";
import { Allowed } from "@/components/manager-only";
import { Badge, Card, Input, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { allDicts } from "@/lib/services/dictionaries";
import { CatalogTabs } from "../tabs";
import { addDictItemAction, moveDictItemAction, removeDictItemAction, renameDictItemAction, resetDictAction } from "./actions";

const arrow = "rounded px-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30";

export default async function DictionariesPage() {
  const s = await requireSession();
  const list = await allDicts(s.companyId);
  const edit = can(s.perms, "catalog", "EDIT");
  const full = can(s.perms, "catalog", "FULL");
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Справочники</PageTitle>
      <CatalogTabs active="dictionaries" />
      <p className="text-sm text-slate-600">
        Списки, из которых выбирают или которые подсказывают при вводе в формах. Пока список не меняли, действует стандартный.
        Переименование и удаление меняют только список: в уже заполненных документах остаётся прежнее значение.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map((d) => (
          <Card
            key={d.kind}
            title={d.label}
            actions={
              d.custom ? (
                full && (
                  <ActionForm action={resetDictAction.bind(null, d.kind)}>
                    <Submit variant="ghost">Вернуть стандартный</Submit>
                  </ActionForm>
                )
              ) : (
                <Badge>стандартный</Badge>
              )
            }
          >
            <p className="mb-2 text-xs text-slate-500">Где используется: {d.usage}</p>
            <div className="mb-3 flex flex-col divide-y">
              {d.items.map((name, i) => (
                <div key={name} className="flex items-center gap-2 py-1">
                  {edit ? (
                    <>
                      <form className="flex flex-col leading-none">
                        <button
                          formAction={moveDictItemAction.bind(null, d.kind, name, -1)}
                          disabled={i === 0}
                          className={arrow}
                          aria-label="Выше"
                        >
                          ▲
                        </button>
                        <button
                          formAction={moveDictItemAction.bind(null, d.kind, name, 1)}
                          disabled={i === d.items.length - 1}
                          className={arrow}
                          aria-label="Ниже"
                        >
                          ▼
                        </button>
                      </form>
                      <ActionForm action={renameDictItemAction.bind(null, d.kind, name)} className="flex flex-1 items-center gap-2">
                        <Input name="name" defaultValue={name} className="flex-1" aria-label={d.label} />
                        <Submit variant="ghost">Сохранить</Submit>
                      </ActionForm>
                    </>
                  ) : (
                    <span className="flex-1 text-sm">{name}</span>
                  )}
                  {full && (
                    <ActionForm action={removeDictItemAction.bind(null, d.kind, name)}>
                      <button className="px-2 text-red-600 hover:underline" aria-label={`Удалить ${name}`}>
                        ✕
                      </button>
                    </ActionForm>
                  )}
                </div>
              ))}
              {d.items.length === 0 && <p className="py-1 text-sm text-slate-500">Список пуст</p>}
            </div>
            <Allowed perms={s.perms} section="catalog" level="CREATE" quiet>
              <ActionForm action={addDictItemAction.bind(null, d.kind)} reset className="flex items-center gap-2">
                <Input name="name" placeholder="Новое значение" className="flex-1" required />
                <Submit variant="ghost">Добавить</Submit>
              </ActionForm>
            </Allowed>
          </Card>
        ))}
      </div>
    </div>
  );
}

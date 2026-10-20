import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { TrashButton } from "@/components/trash-button";
import { Card, PageTitle, td, th } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { isTrashKind, listTrash, TRASH_KINDS } from "@/lib/services/trash";
import { purgeTrashAction, restoreTrashAction } from "../../trash-actions";

const time = (d: Date) => d.toISOString().slice(11, 16);

export default async function TrashPage() {
  const s = await requireSession();
  // в корзине видны документы тех разделов, которые пользователь может смотреть
  const rows = (await listTrash(s.companyId)).filter((r) => isTrashKind(r.kind) && can(s.perms, TRASH_KINDS[r.kind].section));
  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        actions={
          <Link href="/app/documents" className="text-sm text-blue-600 hover:underline">
            ← Все документы
          </Link>
        }
      >
        Корзина
      </PageTitle>
      <Card>
        <p className="mb-3 text-sm text-slate-600">
          Удалённые черновики документов и кассовые операции. Документ можно восстановить с прежним номером или удалить навсегда.
          Проведённые и оплаченные документы удаляются только после отмены проведения и оплат.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className={th}>Удалён</th>
                <th className={th}>Кто удалил</th>
                <th className={th}>Вид</th>
                <th className={th}>Документ</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const k = TRASH_KINDS[r.kind as keyof typeof TRASH_KINDS];
                return (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className={`${td} whitespace-nowrap`}>
                      {formatDate(r.deletedAt)} <span className="text-slate-500">{time(r.deletedAt)} UTC</span>
                    </td>
                    <td className={td}>{r.deletedByName ?? "—"}</td>
                    <td className={td}>{k.label}</td>
                    <td className={td}>{r.title}</td>
                    <td className={`${td} text-right`}>
                      {can(s.perms, k.section, "FULL") && (
                        <div className="flex justify-end gap-2">
                          <ActionForm action={restoreTrashAction.bind(null, r.id)}>
                            <Submit variant="ghost">Восстановить</Submit>
                          </ActionForm>
                          <TrashButton
                            action={purgeTrashAction.bind(null, r.id)}
                            label="Удалить навсегда"
                            question="Удалить документ навсегда? Восстановить его будет нельзя."
                          />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${td} text-slate-500`}>
                    Корзина пуста
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Select } from "@/components/ui";
import type { OfflineReservePhase } from "@prisma/client";
import { setOfflineMasterAction } from "./actions";

const labels: Record<OfflineReservePhase, string> = {
  ONLINE: "Обычный режим",
  OFFLINE: "Только просмотр",
  SYNCING: "Синхронизация",
};

export function OfflineReserveCard({
  members,
  reserve,
}: {
  members: { id: string; user: { name: string; email: string } }[];
  reserve: { masterMembershipId: string; phase: OfflineReservePhase } | null;
}) {
  const master = members.find((member) => member.id === reserve?.masterMembershipId);
  return (
    <Card title="Офлайн-резерв">
      {reserve ? (
        <p className="mb-2 text-sm text-slate-600">
          {labels[reserve.phase]} · Мастер: {master?.user.name}
        </p>
      ) : null}
      {(!reserve || reserve.phase === "ONLINE") && (
        <>
          <p className="mb-3 text-sm text-slate-600">Выбор мастера сохраняется в настройках. Для работы без связи потребуется локальное приложение.</p>
          <ActionForm action={setOfflineMasterAction} className="flex flex-wrap items-end gap-3">
            <Field label="Мастер офлайн-резерва" className="min-w-56">
              <Select name="masterMembershipId" defaultValue={reserve?.masterMembershipId ?? ""}>
                <option value="">Не назначен</option>
                {members.map((member) => (
                  <option value={member.id} key={member.id}>{member.user.name} ({member.user.email})</option>
                ))}
              </Select>
            </Field>
            <Submit>Сохранить мастера</Submit>
          </ActionForm>
        </>
      )}
    </Card>
  );
}

import Link from "next/link";
import { ActionForm, Submit } from "@/components/form";
import { Card, Field, Select } from "@/components/ui";
import type { OfflineReservePhase } from "@prisma/client";
import { revokeWorkstationAction, setOfflineMasterAction } from "./actions";

const labels: Record<OfflineReservePhase, string> = {
  ONLINE: "Обычный режим",
  OFFLINE: "Только просмотр",
  SYNCING: "Синхронизация",
};

export function OfflineReserveCard({
  members,
  reserve,
  isOfflineMaster,
}: {
  members: { id: string; user: { name: string; email: string } }[];
  reserve: {
    masterMembershipId: string;
    phase: OfflineReservePhase;
    workstation: { name: string | null; pairedAt: Date | null; pairingExpiresAt: Date | null } | null;
  } | null;
  isOfflineMaster: boolean;
}) {
  const master = members.find((member) => member.id === reserve?.masterMembershipId);
  const workstation = reserve?.workstation;
  const pending = !!workstation?.pairingExpiresAt && workstation.pairingExpiresAt > new Date();
  return (
    <Card title="Офлайн-резерв">
      {reserve ? (
        <p className="mb-2 text-sm text-slate-600">
          {labels[reserve.phase]} · Мастер: {master?.user.name}
        </p>
      ) : null}
      {(!reserve || reserve.phase === "ONLINE") && (
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
      )}
      {reserve && (
        <div className="mt-4 space-y-2 border-t border-slate-200 pt-4 text-sm">
          <p>{workstation?.pairedAt ? `Привязан ПК «${workstation.name}»` : pending ? "Ожидается привязка ПК" : "Резервный ПК не привязан"}</p>
          {isOfflineMaster && (
            <Link className="inline-block text-blue-600 hover:underline" href="/app/offline-device">Открыть настройки резервного ПК</Link>
          )}
          {reserve.phase === "ONLINE" && (workstation?.pairedAt || pending) && (
            <>
              <p className="text-slate-600">При смене мастера текущая привязка или код будут сброшены.</p>
              <ActionForm action={revokeWorkstationAction}>
                <Submit variant="danger">{workstation?.pairedAt ? "Отвязать ПК" : "Отозвать код"}</Submit>
              </ActionForm>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

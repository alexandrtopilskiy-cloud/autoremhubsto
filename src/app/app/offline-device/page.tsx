import { notFound } from "next/navigation";
import { Card, PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PairForm } from "./pair-form";

export default async function OfflineDevicePage() {
  const s = await requireSession();
  if (!s.isOfflineMaster) notFound();

  const reserve = await prisma.offlineReserve.findFirst({
    where: { companyId: s.companyId, master: { userId: s.userId } },
    select: {
      phase: true,
      workstation: { select: { name: true, pairedAt: true, pairingExpiresAt: true } },
    },
  });
  if (!reserve) notFound();

  const { workstation } = reserve;
  const pendingCode = !!workstation?.pairingExpiresAt && workstation.pairingExpiresAt > new Date();
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Резервный ПК</PageTitle>
      <Card title={workstation?.pairedAt ? "ПК привязан" : "Привязка рабочего компьютера"}>
        {workstation?.pairedAt ? (
          <p className="text-sm">К этой СТО привязан ПК «{workstation.name}». Отвязать его может владелец в настройках компании.</p>
        ) : reserve.phase !== "ONLINE" ? (
          <p className="text-sm">Привязка доступна в обычном режиме работы СТО.</p>
        ) : (
          <>
            <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
              <li>На резервном ПК <a href="/downloads/AutoRemHub-PC.exe" download className="text-blue-600 hover:underline">скачайте AutoRemHub-PC.exe для Windows x64</a> и запустите его.</li>
              <li>Получите код ниже. Вставьте его в окно программы и нажмите «Привязать ПК».</li>
              <li>После подтверждения нажмите «Проверить статус» в кабинете.</li>
            </ol>
            <PairForm pendingCode={pendingCode} />
          </>
        )}
        <p className="mt-4 text-sm text-slate-600">Локальная работа и синхронизация станут доступны после установки офлайн-приложения.</p>
      </Card>
    </div>
  );
}

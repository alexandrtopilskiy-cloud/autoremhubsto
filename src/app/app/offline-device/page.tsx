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
      workstation: { select: { name: true, pairedAt: true, pairingExpiresAt: true, replicaVerifiedAt: true } },
    },
  });
  if (!reserve) notFound();

  const { workstation } = reserve;
  const pendingCode = !!workstation?.pairingExpiresAt && workstation.pairingExpiresAt > new Date();
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Резервный ПК</PageTitle>
      <Card title="Программа для Windows">
        <a href="/downloads/windows-cabinet" className="text-sm text-blue-600 underline">Скачать установщик AutoRemHub СТО для Windows x64</a>
      </Card>
      <Card title={workstation?.pairedAt ? "ПК привязан" : "Привязка рабочего компьютера"}>
        {workstation?.pairedAt ? (
          <>
            <p className="text-sm">К этой СТО привязан ПК «{workstation.name}». Отвязать его может владелец в настройках компании.</p>
            {s.role === "OWNER" && !s.cloudReadOnly && (
              <div className="mt-4 space-y-2 text-sm">
                <p>На привязанном ПК откройте установленную Программу и выберите настройку офлайн-кабинета.</p>
                <p>Получите код загрузки, вставьте его в программу и нажмите «Загрузить снимок».</p>
                <PairForm replica />
              </div>
            )}
          </>
        ) : s.cloudReadOnly ? (
          <p className="text-sm">Привязка доступна в обычном режиме работы СТО.</p>
        ) : (
          <>
            <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm">
              <li>Установите Программу по ссылке выше и откройте настройку офлайн-кабинета.</li>
              <li>Получите код ниже. Вставьте его в окно программы и нажмите «Привязать ПК».</li>
              <li>После подтверждения нажмите «Проверить статус» в кабинете.</li>
            </ol>
            <PairForm pendingCode={pendingCode} />
          </>
        )}
        <div className="mt-4 border-t border-slate-200 pt-4 text-sm">
          <h3 className="mb-1 font-semibold">Сверка данных с сервером</h3>
          {reserve.phase !== "ONLINE" ? (
            <p className="text-amber-800">{reserve.phase === "SYNCING" ? "Идёт синхронизация" : "На сервере доступен только просмотр"}</p>
          ) : workstation?.replicaVerifiedAt ? (
            <p className="text-emerald-800">Снимок данных подтверждён сервером</p>
          ) : (
            <p className="text-slate-600">Совпадение данных ещё не подтверждено.</p>
          )}
          <p className="mt-2 text-slate-600">После настройки резерва при потере связи с Программой веб-кабинет автоматически переходит в режим просмотра. Запись возобновляется после сверки баз.</p>
        </div>
      </Card>
    </div>
  );
}

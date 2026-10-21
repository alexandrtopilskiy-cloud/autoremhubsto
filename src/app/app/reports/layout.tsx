import { Allowed } from "@/components/manager-only";
import { PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { REPORTS } from "@/lib/report-registry";
import { ReportTabs } from "./tabs";

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const tabs = [
    { href: "/app/reports", label: "Монитор" },
    ...Object.entries(REPORTS)
      .filter(([, r]) => !r.costs || s.perms.flags.costs)
      .map(([k, r]) => ({ href: `/app/reports/${k}`, label: r.label })),
  ];
  return (
    <div className="flex flex-col gap-4">
      <PageTitle>Отчёты</PageTitle>
      <Allowed perms={s.perms} section="reports">
        <ReportTabs tabs={tabs} />
        {children}
      </Allowed>
    </div>
  );
}

import { OperatorOnly } from "@/components/manager-only";
import { PageTitle } from "@/components/ui";
import { requireSession } from "@/lib/auth";
import { REPORTS } from "@/lib/report-registry";
import { ReportTabs } from "./tabs";

const tabs = [
  { href: "/app/reports", label: "Монитор" },
  ...Object.entries(REPORTS).map(([k, r]) => ({ href: `/app/reports/${k}`, label: r.label })),
];

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <div className="flex flex-col">
      <PageTitle>Отчёты</PageTitle>
      <OperatorOnly role={s.role}>
        <ReportTabs tabs={tabs} />
        {children}
      </OperatorOnly>
    </div>
  );
}

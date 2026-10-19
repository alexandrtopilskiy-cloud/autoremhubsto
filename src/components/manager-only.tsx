import type { Role } from "@prisma/client";
import { canManage, canOperate } from "@/lib/roles";
import { Card } from "./ui";

/** Заглушка для разделов, которые видят только владелец и администратор. */
export function ManagerOnly({ role, children }: { role: Role; children: React.ReactNode }) {
  if (canManage(role)) return <>{children}</>;
  return (
    <Card>
      <p className="text-sm text-slate-600">Этот раздел доступен владельцу и администраторам СТО.</p>
    </Card>
  );
}

export function OperatorOnly({ role, children }: { role: Role; children: React.ReactNode }) {
  if (canOperate(role)) return <>{children}</>;
  return (
    <Card>
      <p className="text-sm text-slate-600">Этот раздел недоступен для роли «Механик».</p>
    </Card>
  );
}

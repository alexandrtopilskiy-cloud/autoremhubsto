import { Allowed } from "@/components/manager-only";
import { requireSession } from "@/lib/auth";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <Allowed perms={s.perms} section="schedule">
      {children}
    </Allowed>
  );
}

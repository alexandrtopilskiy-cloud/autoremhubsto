import { AppShell } from "@/components/app-shell/app-shell";
import { OFFLINE_READ_ONLY_MESSAGE } from "@/lib/errors";
import { requireSession } from "@/lib/auth";
import { allowedMenu, MENU, MENU_BOTTOM } from "@/lib/nav";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  return (
    <AppShell
      menu={allowedMenu(s.perms, MENU)}
      bottom={allowedMenu(s.perms, MENU_BOTTOM)}
      user={{ name: s.userName, company: s.companyName, role: s.roleName }}
      logout={logoutAction}
    >
      {s.cloudReadOnly && (
        <p role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {OFFLINE_READ_ONLY_MESSAGE}
        </p>
      )}
      {children}
    </AppShell>
  );
}

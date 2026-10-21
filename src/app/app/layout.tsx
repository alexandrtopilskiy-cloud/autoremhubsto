import { AppShell } from "@/components/app-shell/app-shell";
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
      {children}
    </AppShell>
  );
}

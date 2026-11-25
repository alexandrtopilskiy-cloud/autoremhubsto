import { AppShell } from "@/components/app-shell/app-shell";
import { OFFLINE_READ_ONLY_MESSAGE } from "@/lib/errors";
import { isLocalRuntime } from "@/lib/local-runtime";
import { requireSession } from "@/lib/auth";
import { allowedMenu, MENU, MENU_BOTTOM } from "@/lib/nav";
import { logoutAction } from "./actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const bottom = allowedMenu(s.perms, MENU_BOTTOM);
  if (s.isOfflineMaster) {
    bottom.push({ key: "offline-device", label: "Резервный ПК", href: "/app/offline-device", section: "settings", icon: "manage" });
  }
  return (
    <AppShell
      menu={allowedMenu(s.perms, MENU)}
      bottom={bottom}
      user={{ name: s.userName, company: s.companyName, role: s.roleName }}
      logout={logoutAction}
    >
      {isLocalRuntime() && (
        <p role="status" className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
          Офлайн-кабинет. Изменения сохраняются в базе на этом ПК.
        </p>
      )}
      {s.cloudReadOnly && (
        <p role="status" className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {OFFLINE_READ_ONLY_MESSAGE}
        </p>
      )}
      {children}
    </AppShell>
  );
}

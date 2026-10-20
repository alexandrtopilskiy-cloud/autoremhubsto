import { can, FLAGS, SECTIONS, type Flag, type Level, type Permissions, type Section } from "@/lib/permissions";
import { Card } from "./ui";

/**
 * Показывает содержимое, если хватает прав на раздел (и флага, если задан).
 * Иначе — карточка «нет доступа» или ничего (quiet), например для формы создания.
 */
export function Allowed({
  perms,
  section,
  level = "VIEW",
  flag,
  quiet = false,
  children,
}: {
  perms: Permissions;
  section: Section;
  level?: Level;
  flag?: Flag;
  quiet?: boolean;
  children: React.ReactNode;
}) {
  if (can(perms, section, level) && (!flag || perms.flags[flag])) return <>{children}</>;
  if (quiet) return null;
  const what = flag && can(perms, section, level) ? `«${FLAGS.find((f) => f.key === flag)!.label}»` : `раздел «${SECTIONS.find((s) => s.key === section)!.label}»`;
  return (
    <Card>
      <p className="text-sm text-slate-600">Нет доступа: {what}. Права выдаёт владелец или администратор СТО.</p>
    </Card>
  );
}

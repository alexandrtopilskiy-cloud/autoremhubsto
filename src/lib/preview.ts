// Панель просмотра списков загружается серверным действием страницы отдельно от списка.
// Действие — отдельная точка входа, поэтому права на раздел проверяются здесь, как в layout раздела.
import { requireSession, type SessionCtx } from "./auth";
import { can, type Flag, type Section } from "./permissions";

/** Сессия для загрузки панели просмотра или null, если раздел (или флаг) недоступен. */
export async function previewSession(section: Section, flag?: Flag): Promise<SessionCtx | null> {
  const s = await requireSession();
  return can(s.perms, section) && (!flag || s.perms.flags[flag]) ? s : null;
}

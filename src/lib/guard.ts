import { revalidatePath } from "next/cache";
import { requireSession, type SessionCtx } from "./auth";
import { run, type FormState } from "./actions";
import { OFFLINE_READ_ONLY_MESSAGE, UserError } from "./errors";
import { assertCan, type Level, type Section } from "./permissions";

/** Действие формы с проверкой прав на раздел: ошибки ввода и нехватка прав возвращаются текстом. */
export async function guarded(
  section: Section,
  level: Level,
  path: string,
  fn: (companyId: string, s: SessionCtx) => Promise<unknown>,
): Promise<FormState> {
  const s = await requireSession();
  const res = await run(async () => {
    if (s.cloudReadOnly && level !== "NONE" && level !== "VIEW") throw new UserError(OFFLINE_READ_ONLY_MESSAGE);
    assertCan(s.perms, section, level);
    await fn(s.companyId, s);
  });
  revalidatePath(path);
  return res;
}

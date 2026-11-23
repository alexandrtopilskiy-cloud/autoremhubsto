/** Ошибка, текст которой можно показать пользователю. */
export class UserError extends Error {}

export class NotFoundError extends UserError {
  constructor(what = "Запись") {
    super(`${what} не найдена`);
  }
}

export const OFFLINE_READ_ONLY_MESSAGE = "СТО в резервном режиме. Изменения на сервере временно приостановлены.";

export function isOfflineReadOnlyError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("STO_OFFLINE_READ_ONLY");
}

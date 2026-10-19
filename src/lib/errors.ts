/** Ошибка, текст которой можно показать пользователю. */
export class UserError extends Error {}

export class NotFoundError extends UserError {
  constructor(what = "Запись") {
    super(`${what} не найдена`);
  }
}

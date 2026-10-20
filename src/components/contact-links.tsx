import { contactLinks } from "@/lib/contact";

/** «Отправить сообщение» рядом с телефоном клиента: звонок, SMS и мессенджеры с заготовленным текстом. */
export function ContactLinks({ phone, text }: { phone: string | null | undefined; text: string }) {
  const l = contactLinks(phone, text);
  if (!l) return null;
  const a = "rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700 hover:border-blue-400 hover:text-blue-700";
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle print:hidden">
      <a href={l.tel} className={a}>
        Позвонить
      </a>
      <a href={l.sms} className={a}>
        SMS
      </a>
      <a href={l.whatsapp} target="_blank" rel="noreferrer" className={a}>
        WhatsApp
      </a>
      <a href={l.telegram} target="_blank" rel="noreferrer" className={a} title="Откроется чат, если клиент разрешил поиск по номеру">
        Telegram
      </a>
    </span>
  );
}

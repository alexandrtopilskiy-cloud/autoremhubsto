// Ссылки «Позвонить / SMS / WhatsApp / Telegram» по номеру клиента с готовым текстом сообщения.

/** Номер в международном виде без «+»: «8 (901) 222-33-44» → «79012223344». Неразборчивый номер → null. */
export function normalizePhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("8")) d = `7${d.slice(1)}`;
  if (d.length === 10) d = `7${d}`;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function contactLinks(phone: string | null | undefined, text: string) {
  const n = normalizePhone(phone);
  if (!n) return null;
  const t = encodeURIComponent(text);
  return {
    tel: `tel:+${n}`,
    sms: `sms:+${n}?body=${t}`,
    whatsapp: `https://wa.me/${n}?text=${t}`,
    telegram: `https://t.me/+${n}`,
  };
}

import { currentSession } from "@/lib/auth";
import { NotFoundError } from "@/lib/errors";
import { getAttachment, INLINE_MIME, viewableKinds } from "@/lib/services/attachments";

/** Выдача вложения. Картинки и PDF открываются в браузере, остальное скачивается. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  if (!s) return new Response("Нужно войти", { status: 401 });
  const { id } = await params;
  // файл чужого раздела (например, паспорт сотрудника без права «staff») выглядит как несуществующий
  const a = await getAttachment(s.companyId, id, viewableKinds(s.perms)).catch((e) => {
    if (e instanceof NotFoundError) return null;
    throw e;
  });
  if (!a) return new Response("Файл не найден", { status: 404 });
  const inline = INLINE_MIME.includes(a.mime) && !new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(a.data), {
    headers: {
      "Content-Type": inline ? a.mime : "application/octet-stream",
      "Content-Length": String(a.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="file"; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

import type { DocKind } from "@prisma/client";
import { uploadAttachmentAction, deleteAttachmentAction } from "@/app/app/attachment-actions";
import { listAttachments } from "@/lib/services/attachments";
import { ActionForm, Submit } from "./form";
import { Card } from "./ui";

const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} КБ` : `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} МБ`);
const isImage = (m: string) => ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(m);

/** Файлы и фото документа: загрузка, просмотр, удаление. */
export async function Attachments({
  companyId,
  kind,
  docId,
  path,
  title = "Файлы и фото",
  accept,
  hint = "До 10 МБ на файл",
}: {
  companyId: string;
  kind: DocKind;
  docId: string;
  path: string;
  title?: string;
  accept?: string;
  hint?: string;
}) {
  const files = await listAttachments(companyId, kind, docId);
  return (
    <Card title={`${title}${files.length ? ` · ${files.length}` : ""}`}>
      {files.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-3">
          {files.map((f) => (
            <li key={f.id} className="flex w-40 flex-col gap-1 text-xs">
              <a href={`/app/files/${f.id}`} target="_blank" className="block h-28 overflow-hidden rounded border border-slate-200 bg-slate-50">
                {isImage(f.mime) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/app/files/${f.id}`} alt={f.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full items-center justify-center p-2 text-center text-slate-600">{f.name}</span>
                )}
              </a>
              <span className="truncate" title={f.name}>
                {f.name}
              </span>
              <span className="flex justify-between text-slate-500">
                {size(f.size)}
                <ActionForm action={deleteAttachmentAction.bind(null, f.id, path)}>
                  <button className="text-red-600 hover:underline">Удалить</button>
                </ActionForm>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ActionForm action={uploadAttachmentAction.bind(null, kind, docId, path)} reset className="flex flex-wrap items-center gap-3">
        <input type="file" name="file" multiple accept={accept} className="text-sm" />
        <Submit variant="ghost">Загрузить</Submit>
        <span className="text-xs text-slate-500">{hint}</span>
      </ActionForm>
    </Card>
  );
}

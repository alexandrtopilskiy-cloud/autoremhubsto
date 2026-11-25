import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { prisma } from "../db";
import { UserError } from "../errors";
import { restoreReplica } from "./offline-replica-restore";

const origin = "https://sto.autoremhub.ru";
const codes = z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/, "Введите действующий код из раздела «Резервный ПК»");
export const localSetupSchema = z.object({
  code: codes,
  password: z.string().min(8, "Пароль должен содержать минимум 8 символов")
    .refine((value) => Buffer.byteLength(value) <= 72, "Пароль слишком длинный"),
});

const snapshotResponse = z.object({
  format: z.number().int(),
  companyId: z.string().min(1),
  masterUserId: z.string().min(1),
  digest: z.string().regex(/^[a-f0-9]{64}$/),
  tables: z.array(z.object({ table: z.string(), rows: z.array(z.string()) })),
});

type CloudRequest = (path: string, body: object) => Promise<unknown>;

async function workstationKey(pairing: boolean) {
  const directory = join(homedir(), ".autoremhubsto");
  const path = join(directory, "workstation-key.pem");
  try {
    return createPrivateKey(await readFile(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    if (!pairing) throw new UserError("Сначала привяжите этот ПК к СТО в разделе «Резервный ПК».");
  }
  const { privateKey } = generateKeyPairSync("ed25519");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    await writeFile(path, privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  return createPrivateKey(await readFile(path));
}

function deviceProof(key: KeyObject, message: string) {
  return {
    publicKey: createPublicKey(key).export({ type: "spki", format: "der" }).toString("base64url"),
    signature: sign(null, Buffer.from(message), key).toString("base64url"),
  };
}

async function postCloud(path: string, body: object) {
  let response: Response;
  try {
    response = await fetch(origin + path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(240_000),
      redirect: "error",
      cache: "no-store",
    });
  } catch {
    throw new UserError("Не удалось связаться с сервером СТО. Проверьте интернет.");
  }
  if (!response.ok) {
    if (response.status === 409) throw new UserError("Код использован, снимок изменился или СТО переведена в резерв.");
    throw new UserError("Сервер не подтвердил код или привязку этого ПК.");
  }

  const limit = 256 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new UserError("Сервер не вернул снимок.");
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new UserError("Размер снимка превышает 256 МБ.");
      parts.push(value);
    }
    return JSON.parse(Buffer.concat(parts, bytes).toString("utf8")) as unknown;
  } finally {
    await reader.cancel().catch(() => {});
  }
}

export async function pairLocalCabinet(pairingCode: string) {
  const code = codes.parse(pairingCode);
  const key = await workstationKey(true);
  const name = Array.from(hostname().trim() || "Рабочий ПК").slice(0, 40).join("");
  await postCloud("/api/offline/workstation/pair", {
    code, name, ...deviceProof(key, `autoremhubsto/workstation-pair/v1\n${code}\n${name}`),
  });
}

export async function restoreLocalCabinet(
  input: z.infer<typeof localSetupSchema>,
  key: KeyObject,
  request: CloudRequest,
) {
  const { code, password } = localSetupSchema.parse(input);
  if (await prisma.company.findFirst({ select: { id: true } })) {
    throw new UserError("Локальная база уже настроена.");
  }

  const ask = (digest?: string) => {
    const at = Date.now();
    const message = JSON.stringify(["autoremhubsto/desktop-replica/v1", digest ? "confirm" : "snapshot", code, at, digest ?? null]);
    return request("/api/offline/workstation/desktop-replica", { code, at, ...(digest ? { digest } : {}), ...deviceProof(key, message) });
  };
  const snapshot = snapshotResponse.safeParse(await ask());
  if (!snapshot.success) throw new UserError("Снимок СТО несовместим с версией Windows-приложения.");
  const { masterUserId } = snapshot.data;
  const digest = await prisma.$transaction(
    (tx) => restoreReplica(tx, snapshot.data, { userId: masterUserId, password }),
    { timeout: 240_000 },
  );
  const confirmed = await ask(digest)
    .then((reply) => z.object({ digest: z.literal(digest) }).safeParse(reply).success)
    .catch(() => false);
  return { confirmed };
}

export async function setupLocalCabinet(input: unknown) {
  const values = localSetupSchema.parse(input);
  return restoreLocalCabinet(values, await workstationKey(false), postCloud);
}

import { createPrivateKey, createPublicKey, generateKeyPairSync, sign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";

async function loadOrCreateKey() {
  const directory = join(homedir(), ".autoremhubsto");
  const file = join(directory, "workstation-key.pem");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    return createPrivateKey(await readFile(file));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const { privateKey } = generateKeyPairSync("ed25519");
  try {
    await writeFile(file, privateKey.export({ format: "pem", type: "pkcs8" }), { flag: "wx", mode: 0o600 });
    return privateKey;
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return createPrivateKey(await readFile(file));
  }
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Установите Node.js 22 или новее");
  const server = new URL(process.argv[2] ?? "https://sto.autoremhub.ru");
  const local = server.hostname === "localhost" || server.hostname === "127.0.0.1";
  if (server.protocol !== "https:" && !(server.protocol === "http:" && local)) {
    throw new Error("Укажите HTTPS-адрес сервера СТО");
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  let code;
  try {
    code = (await terminal.question("Одноразовый код из кабинета СТО: ")).trim();
  } finally {
    terminal.close();
  }
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) throw new Error("Проверьте формат кода");

  const name = hostname().trim().slice(0, 80) || "Рабочий ПК";
  const privateKey = await loadOrCreateKey();
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" }).toString("base64url");
  const message = Buffer.from(`autoremhubsto/workstation-pair/v1\n${code}\n${name}`);
  const signature = sign(null, message, privateKey).toString("base64url");
  const response = await fetch(new URL("/api/offline/workstation/pair", server), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, name, publicKey, signature }),
    redirect: "error",
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok || result.paired !== true) throw new Error(result.error ?? "Сервер не подтвердил привязку");
  console.log(`ПК «${name}» привязан. Проверьте статус в кабинете СТО.`);
}

main().catch((error) => {
  console.error(`Привязка не завершена. ${error.message}`);
  process.exitCode = 1;
});

import crypto from "crypto";
import { UserError } from "./errors";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT_LENGTH = 16;

function getKey(salt: Buffer): Buffer {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret) {
    throw new UserError("Ошибка конфигурации: не задан ENCRYPTION_SECRET в .env");
  }
  // Генерируем 32-байтовый ключ из секрета и соли
  return crypto.scryptSync(secret, salt, 32);
}

/**
 * Шифрует строку (обычно JSON с ключами API).
 * Возвращает строку в формате: salt:iv:tag:encryptedData (все в hex).
 */
export function encrypt(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey(salt);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [salt.toString("hex"), iv.toString("hex"), tag.toString("hex"), encrypted.toString("hex")].join(":");
}

/**
 * Расшифровывает строку, созданную функцией encrypt.
 */
export function decrypt(ciphertext: string): string {
  try {
    const [saltHex, ivHex, tagHex, encryptedHex] = ciphertext.split(":");
    if (!saltHex || !ivHex || !tagHex || !encryptedHex) {
      throw new Error("Неверный формат зашифрованной строки");
    }

    const salt = Buffer.from(saltHex, "hex");
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const key = getKey(salt);
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (e) {
    console.error("Ошибка расшифровки:", e);
    throw new UserError("Не удалось расшифровать данные интеграции. Проверьте ENCRYPTION_SECRET.");
  }
}

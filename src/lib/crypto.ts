import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * ENCRYPTION_KEY pode ser 32 bytes em base64 OU qualquer frase secreta com 32+ caracteres
 * (nesse caso a chave AES é derivada com SHA-256).
 */
function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY?.trim();
  if (!raw) throw new Error("ENCRYPTION_KEY não configurada no servidor.");
  const b64 = /^[A-Za-z0-9+/]{43}=$/.test(raw) ? Buffer.from(raw, "base64") : null;
  if (b64 && b64.length === 32) return b64;
  if (raw.length < 32) throw new Error("ENCRYPTION_KEY precisa ter pelo menos 32 caracteres.");
  return createHash("sha256").update(raw, "utf8").digest();
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  auth_tag: string;
}

/** AES-256-GCM. A chave em texto puro nunca é gravada nem devolvida ao navegador. */
export function encryptSecret(plain: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), auth_tag: cipher.getAuthTag().toString("base64") };
}

export function decryptSecret(s: EncryptedSecret): string {
  const decipher = createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(s.iv, "base64"));
  decipher.setAuthTag(Buffer.from(s.auth_tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(s.ciphertext, "base64")), decipher.final()]).toString("utf8");
}

export function last4(key: string): string {
  return key.slice(-4);
}

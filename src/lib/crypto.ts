import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function masterKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY não configurada no servidor.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ENCRYPTION_KEY precisa ter 32 bytes em base64.");
  return key;
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

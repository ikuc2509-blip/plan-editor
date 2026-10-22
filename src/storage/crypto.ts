// Шифрование файла проекта паролем: встроенный в браузер Web Crypto, без внешних библиотек.
// Ключ — из пароля через PBKDF2-SHA-256 (медленно нарочно: так пароль труднее подобрать перебором).

export interface CipherParams {
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA-256';
  iterations: number;
  /** base64 */
  salt: string;
  iv: string;
}

export const PBKDF2_ITERATIONS = 600_000;

export class WrongPasswordError extends Error {
  constructor() { super('Неверный пароль'); }
}

const b64 = (u: Uint8Array): string => btoa(String.fromCharCode(...u));
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function encrypt(data: Uint8Array, password: string): Promise<{ params: CipherParams; data: Uint8Array }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data as BufferSource));
  return { params: { alg: 'AES-GCM', kdf: 'PBKDF2-SHA-256', iterations: PBKDF2_ITERATIONS, salt: b64(salt), iv: b64(iv) }, data: out };
}

/** Неверный пароль или испорченный файл — WrongPasswordError (AES-GCM их не различает) */
export async function decrypt(data: Uint8Array, params: CipherParams, password: string): Promise<Uint8Array> {
  const key = await deriveKey(password, unb64(params.salt), params.iterations);
  try {
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(params.iv) as BufferSource }, key, data as BufferSource));
  } catch {
    throw new WrongPasswordError();
  }
}

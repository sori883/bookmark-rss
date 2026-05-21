export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptoError";
  }
}

const KEY_BYTES = 32;
const IV_BYTES = 12;
const HEX_PATTERN = /^[0-9a-fA-F]+$/;

const hexToBytes = (hex: string): Uint8Array<ArrayBuffer> => {
  if (hex.length !== KEY_BYTES * 2) {
    throw new CryptoError(
      `master key must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${hex.length}`,
    );
  }
  if (!HEX_PATTERN.test(hex)) {
    throw new CryptoError("master key contains non-hex characters");
  }
  const out = new Uint8Array(new ArrayBuffer(KEY_BYTES));
  for (let i = 0; i < KEY_BYTES; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const base64ToBytes = (b64: string): Uint8Array<ArrayBuffer> => {
  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new CryptoError("ciphertext is not valid base64");
  }
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const importAesKey = async (
  rawKey: Uint8Array<ArrayBuffer>,
): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);

export const encryptSecret = async (
  plaintext: string,
  masterKeyHex: string,
): Promise<string> => {
  const rawKey = hexToBytes(masterKeyHex);
  const key = await importAesKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(IV_BYTES)));
  const data = new TextEncoder().encode(plaintext);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data),
  );
  const combined = new Uint8Array(
    new ArrayBuffer(iv.length + ciphertext.length),
  );
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);
  return bytesToBase64(combined);
};

export const decryptSecret = async (
  payload: string,
  masterKeyHex: string,
): Promise<string> => {
  const rawKey = hexToBytes(masterKeyHex);
  const combined = base64ToBytes(payload);
  if (combined.length < IV_BYTES + 1) {
    throw new CryptoError("ciphertext is shorter than required IV length");
  }
  const iv = combined.slice(0, IV_BYTES);
  const ciphertext = combined.slice(IV_BYTES);
  const key = await importAesKey(rawKey);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext,
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new CryptoError("failed to decrypt: bad key or tampered ciphertext");
  }
};

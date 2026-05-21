import { describe, expect, it } from "vitest";

import { CryptoError, decryptSecret, encryptSecret } from "../src/crypto";

const keyA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const keyB = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("encryptSecret / decryptSecret", () => {
  it("round-trips an arbitrary plaintext", async () => {
    const ciphertext = await encryptSecret(
      "https://discord.com/api/webhooks/123/abc",
      keyA,
    );
    expect(typeof ciphertext).toBe("string");
    expect(ciphertext).not.toContain("discord.com");

    const restored = await decryptSecret(ciphertext, keyA);
    expect(restored).toBe("https://discord.com/api/webhooks/123/abc");
  });

  it("produces a different ciphertext each time (random IV)", async () => {
    const a = await encryptSecret("hello", keyA);
    const b = await encryptSecret("hello", keyA);
    expect(a).not.toBe(b);
  });

  it("fails to decrypt when the wrong key is used", async () => {
    const ciphertext = await encryptSecret("secret", keyA);
    await expect(decryptSecret(ciphertext, keyB)).rejects.toThrow(CryptoError);
  });

  it("fails to decrypt when the ciphertext is tampered with", async () => {
    const ciphertext = await encryptSecret("secret", keyA);
    const tampered = ciphertext.slice(0, -2) + "AA";
    await expect(decryptSecret(tampered, keyA)).rejects.toThrow(CryptoError);
  });

  it("rejects keys that are not 32 bytes (64 hex chars)", async () => {
    await expect(encryptSecret("x", "abcd")).rejects.toThrow(CryptoError);
    await expect(decryptSecret("anything", "abcd")).rejects.toThrow(
      CryptoError,
    );
  });

  it("rejects keys that contain non-hex characters", async () => {
    const badKey = "z".repeat(64);
    await expect(encryptSecret("x", badKey)).rejects.toThrow(CryptoError);
  });

  it("handles unicode plaintext", async () => {
    const ciphertext = await encryptSecret("日本語🎉", keyA);
    expect(await decryptSecret(ciphertext, keyA)).toBe("日本語🎉");
  });

  it("handles empty plaintext", async () => {
    const ciphertext = await encryptSecret("", keyA);
    expect(await decryptSecret(ciphertext, keyA)).toBe("");
  });
});

/**
 * Salted scrypt password hashing — no external dependency (node:crypto only).
 * Stored form: "scrypt$<saltHex>$<hashHex>". Used for staff logins (ops.staff
 * password_hash). Not the super-admin auth, which is a shared env password.
 */
import crypto from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  let actual: Buffer;
  try {
    actual = crypto.scryptSync(password, salt, expected.length);
  } catch {
    return false;
  }
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

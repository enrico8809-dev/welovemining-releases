import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
import { User } from "./store";

/**
 * Auth with nothing but the Node standard library — no bcrypt, no jsonwebtoken.
 * Both would be native or transitive dependencies on a machine that has to keep
 * running unattended, and scrypt + HMAC cover this properly.
 */

const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt$${salt}$${key}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, key] = stored.split("$");
  if (scheme !== "scrypt" || !salt || !key) return false;

  const candidate = scryptSync(password, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(key, "hex");
  // Length check first: timingSafeEqual throws on a mismatch rather than
  // returning false, which would surface as a 500 instead of a failed login.
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export interface TokenPayload {
  userId: string;
  role: User["role"];
  issuedAt: number;
  expiresAt: number;
}

const TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000; // 60 days — this is a phone app

export function issueToken(user: User, secret: string, now = Date.now()): string {
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    issuedAt: now,
    expiresAt: now + TOKEN_TTL_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(body, secret);
  return `${body}.${signature}`;
}

export function verifyToken(
  token: string,
  secret: string,
  now = Date.now()
): TokenPayload | null {
  const [body, signature] = (token ?? "").split(".");
  if (!body || !signature) return null;

  const expected = sign(body, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (typeof payload.expiresAt !== "number" || payload.expiresAt < now) return null;
    return payload;
  } catch {
    return null;
  }
}

function sign(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}

export function newId(prefix: string): string {
  return `${prefix}-${randomBytes(8).toString("hex")}`;
}

/** Short, readable, unambiguous — it gets typed in by hand. */
export function newInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function normaliseEmail(email: string): string {
  return (email ?? "").trim().toLowerCase();
}

/** Viewers can read the books but never change them. */
export function canWrite(role: User["role"]): boolean {
  return role === "owner" || role === "bookkeeper";
}

export function canManageUsers(role: User["role"]): boolean {
  return role === "owner";
}

export interface PasswordRule {
  ok: boolean;
  reason?: string;
}

export function checkPassword(password: string): PasswordRule {
  if (!password || password.length < 10) {
    return { ok: false, reason: "Use at least 10 characters." };
  }
  if (/^\d+$/.test(password)) {
    return { ok: false, reason: "Digits alone are too easy to guess." };
  }
  return { ok: true };
}

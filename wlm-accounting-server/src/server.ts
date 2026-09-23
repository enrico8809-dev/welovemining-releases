import express, { NextFunction, Request, Response } from "express";
import {
  canManageUsers,
  canWrite,
  checkPassword,
  hashPassword,
  issueToken,
  newId,
  newInviteCode,
  normaliseEmail,
  verifyPassword,
  verifyToken,
  TokenPayload,
} from "./auth";
import { COLLECTIONS, CollectionName, Store, User } from "./store";
import {
  SyncRecord,
  changedSince,
  forWire,
  mergeInto,
  mergeSingleton,
  singletonChangedSince,
  purgeTombstones,
} from "./merge";

const MAX_BODY = "12mb"; // a logo travels inside settings

interface AuthedRequest extends Request {
  auth?: TokenPayload;
  user?: User;
}

/**
 * Failed sign-ins are throttled per email. The tunnel puts this on the public
 * internet, so an unthrottled login is an open invitation to guess passwords.
 */
class LoginThrottle {
  private attempts = new Map<string, { count: number; firstAt: number }>();
  private readonly windowMs = 15 * 60 * 1000;
  private readonly limit = 8;

  check(key: string, now = Date.now()): boolean {
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) return true;
    return entry.count < this.limit;
  }

  fail(key: string, now = Date.now()): void {
    const entry = this.attempts.get(key);
    if (!entry || now - entry.firstAt > this.windowMs) {
      this.attempts.set(key, { count: 1, firstAt: now });
    } else {
      entry.count++;
    }
  }

  clear(key: string): void {
    this.attempts.delete(key);
  }
}

export function createApp(store: Store) {
  const app = express();
  const throttle = new LoginThrottle();

  app.disable("x-powered-by");
  app.use(express.json({ limit: MAX_BODY }));

  // Cloudflare terminates TLS; refuse to be framed or sniffed regardless.
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    next();
  });

  const authenticate = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    const payload = verifyToken(token, store.read().tokenSecret);
    if (!payload) {
      res.status(401).json({ error: "Sign in again." });
      return;
    }
    const user = store.read().users.find((u) => u.id === payload.userId);
    if (!user) {
      res.status(401).json({ error: "That account no longer exists." });
      return;
    }
    req.auth = payload;
    req.user = user;
    next();
  };

  const requireWrite = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !canWrite(req.user.role)) {
      res.status(403).json({ error: "Your account has view-only access." });
      return;
    }
    next();
  };

  // --- status -------------------------------------------------------------

  app.get("/api/health", (_req, res) => {
    const db = store.read();
    res.json({
      ok: true,
      service: "wlm-accounting-server",
      version: 1,
      // Tells the app whether this server still needs its first owner.
      claimed: db.users.length > 0,
      stats: store.stats(),
    });
  });

  // --- accounts -----------------------------------------------------------

  /** First run only: whoever claims the server becomes its owner. */
  app.post("/api/claim", (req, res) => {
    const db = store.read();
    if (db.users.length > 0) {
      res.status(409).json({ error: "This server already has an owner." });
      return;
    }

    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const name = String(req.body?.name ?? "").trim() || "Owner";

    if (!email.includes("@")) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    const rule = checkPassword(password);
    if (!rule.ok) {
      res.status(400).json({ error: rule.reason });
      return;
    }

    const user: User = {
      id: newId("usr"),
      email,
      name,
      role: "owner",
      passwordHash: hashPassword(password),
      createdAt: Date.now(),
    };
    store.write((d) => d.users.push(user));

    res.json({ token: issueToken(user, db.tokenSecret), user: publicUser(user) });
  });

  app.post("/api/login", (req, res) => {
    const email = normaliseEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const invite = String(req.body?.inviteCode ?? "").trim().toUpperCase();

    if (!throttle.check(email)) {
      res.status(429).json({ error: "Too many attempts. Try again in 15 minutes." });
      return;
    }

    const db = store.read();
    const user = db.users.find((u) => u.email === email);

    // An outstanding invite is redeemed by signing in with the code, which
    // then sets the password for that account.
    if (user?.inviteCode) {
      if (invite !== user.inviteCode) {
        throttle.fail(email);
        res.status(401).json({ error: "That invite code doesn't match." });
        return;
      }
      const rule = checkPassword(password);
      if (!rule.ok) {
        res.status(400).json({ error: rule.reason });
        return;
      }
      store.write(() => {
        user.passwordHash = hashPassword(password);
        delete user.inviteCode;
        user.lastSeenAt = Date.now();
      });
      throttle.clear(email);
      res.json({ token: issueToken(user, db.tokenSecret), user: publicUser(user) });
      return;
    }

    if (!user || !verifyPassword(password, user.passwordHash)) {
      throttle.fail(email);
      // Same message either way, so the response can't be used to discover
      // which email addresses have accounts.
      res.status(401).json({ error: "Email or password is wrong." });
      return;
    }

    store.write(() => {
      user.lastSeenAt = Date.now();
    });
    throttle.clear(email);
    res.json({ token: issueToken(user, db.tokenSecret), user: publicUser(user) });
  });

  app.get("/api/me", authenticate, (req: AuthedRequest, res) => {
    res.json({ user: publicUser(req.user!) });
  });

  app.get("/api/users", authenticate, (req: AuthedRequest, res) => {
    res.json({ users: store.read().users.map(publicUser) });
  });

  /** Owner invites a colleague; they sign in with the code and set a password. */
  app.post("/api/users", authenticate, (req: AuthedRequest, res) => {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: "Only the owner can add users." });
      return;
    }

    const email = normaliseEmail(req.body?.email);
    const name = String(req.body?.name ?? "").trim() || email;
    const role = req.body?.role === "viewer" ? "viewer" : "bookkeeper";

    if (!email.includes("@")) {
      res.status(400).json({ error: "Enter a valid email address." });
      return;
    }
    if (store.read().users.some((u) => u.email === email)) {
      res.status(409).json({ error: "That email already has an account." });
      return;
    }

    const inviteCode = newInviteCode();
    const user: User = {
      id: newId("usr"),
      email,
      name,
      role,
      passwordHash: "",
      createdAt: Date.now(),
      inviteCode,
    };
    store.write((d) => d.users.push(user));

    // The code is returned once, for the owner to pass on however they like.
    // There's no mail server here and inventing one would be a liability.
    res.json({ user: publicUser(user), inviteCode });
  });

  app.delete("/api/users/:id", authenticate, (req: AuthedRequest, res) => {
    if (!canManageUsers(req.user!.role)) {
      res.status(403).json({ error: "Only the owner can remove users." });
      return;
    }
    if (req.params.id === req.user!.id) {
      res.status(400).json({ error: "You can't remove your own account." });
      return;
    }
    store.write((d) => {
      d.users = d.users.filter((u) => u.id !== req.params.id);
    });
    res.json({ ok: true });
  });

  // --- sync ---------------------------------------------------------------

  app.post("/api/sync", authenticate, (req: AuthedRequest, res) => {
    const now = Date.now();
    const since = Number(req.body?.since ?? 0) || 0;
    const incoming = (req.body?.changes ?? {}) as Record<string, unknown>;
    const writable = canWrite(req.user!.role);

    let applied = 0;

    store.write((db) => {
      if (writable) {
        for (const name of COLLECTIONS) {
          const batch = incoming[name];
          if (!Array.isArray(batch) || !batch.length) continue;
          const map = store.collection(name as CollectionName);
          applied += mergeInto(map, batch as SyncRecord[], now);
          purgeTombstones(map, now);
          store.saveCollection(name as CollectionName, map);
        }

        const settings = incoming.settings as
          | { value: unknown; updatedAt: number }
          | undefined;
        if (settings && typeof settings.updatedAt === "number") {
          db.settings = mergeSingleton(db.settings, settings, now);
        }

        const openingBank = incoming.openingBank as
          | { value: number; updatedAt: number }
          | undefined;
        if (openingBank && typeof openingBank.updatedAt === "number") {
          db.openingBank = mergeSingleton(db.openingBank, openingBank, now);
        }
      }
    });

    const changes: Record<string, unknown> = {};
    for (const name of COLLECTIONS) {
      changes[name] = changedSince(store.collection(name), since).map(forWire);
    }

    const db = store.read();
    // Singletons have no per-record cursor, so they ride along whenever the
    // caller is behind. Cheap, and avoids a second round trip.
    if (singletonChangedSince(db.settings, since)) changes.settings = db.settings;
    if (singletonChangedSince(db.openingBank, since)) {
      changes.openingBank = db.openingBank;
    }

    res.json({
      serverTime: now,
      applied,
      readOnly: !writable,
      changes,
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ error: "No such endpoint." });
  });

  // Express needs all four parameters to recognise an error handler.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[wlm-accounting]", err.message);
    res.status(500).json({ error: "Something went wrong on the server." });
  });

  return app;
}

function publicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
    lastSeenAt: user.lastSeenAt,
    pendingInvite: !!user.inviteCode,
  };
}

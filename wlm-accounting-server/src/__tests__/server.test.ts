import request from "supertest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server";
import { Store } from "../store";
import { newSecret } from "../auth";

function freshApp() {
  const dir = mkdtempSync(join(tmpdir(), "wlm-test-"));
  const store = new Store(join(dir, "ledger.json"), newSecret);
  return { app: createApp(store), store, dir };
}

const OWNER = { email: "enrico@welovemining.co.za", password: "correct horse battery", name: "Enrico" };

async function claimed() {
  const ctx = freshApp();
  const res = await request(ctx.app).post("/api/claim").send(OWNER);
  return { ...ctx, token: res.body.token as string };
}

describe("health", () => {
  it("reports an unclaimed server", async () => {
    const { app, dir } = freshApp();
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.claimed).toBe(false);
    rmSync(dir, { recursive: true, force: true });
  });

  it("reports a claimed server", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).get("/api/health");
    expect(res.body.claimed).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("claiming the server", () => {
  it("makes the first account the owner", async () => {
    const { app, dir } = freshApp();
    const res = await request(app).post("/api/claim").send(OWNER);
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("owner");
    expect(res.body.token).toBeTruthy();
    rmSync(dir, { recursive: true, force: true });
  });

  it("can only happen once", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).post("/api/claim").send({ ...OWNER, email: "someone@else.com" });
    expect(res.status).toBe(409);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a weak password", async () => {
    const { app, dir } = freshApp();
    const res = await request(app).post("/api/claim").send({ ...OWNER, password: "short" });
    expect(res.status).toBe(400);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses an address that isn't one", async () => {
    const { app, dir } = freshApp();
    const res = await request(app).post("/api/claim").send({ ...OWNER, email: "nope" });
    expect(res.status).toBe(400);
    rmSync(dir, { recursive: true, force: true });
  });

  it("never returns the password hash", async () => {
    const { app, dir } = freshApp();
    const res = await request(app).post("/api/claim").send(OWNER);
    expect(JSON.stringify(res.body)).not.toContain("scrypt$");
    expect(res.body.user.passwordHash).toBeUndefined();
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("signing in", () => {
  it("accepts the right password", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).post("/api/login").send(OWNER);
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    rmSync(dir, { recursive: true, force: true });
  });

  it("rejects the wrong password", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).post("/api/login").send({ ...OWNER, password: "wrong wrong wrong" });
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("gives the same answer for an unknown email as for a wrong password", async () => {
    const { app, dir } = await claimed();
    const unknown = await request(app).post("/api/login").send({ email: "nobody@x.com", password: "whatever at all" });
    const wrong = await request(app).post("/api/login").send({ ...OWNER, password: "whatever at all" });
    expect(unknown.body.error).toBe(wrong.body.error);
    rmSync(dir, { recursive: true, force: true });
  });

  it("throttles repeated failures", async () => {
    const { app, dir } = await claimed();
    for (let i = 0; i < 8; i++) {
      await request(app).post("/api/login").send({ ...OWNER, password: `bad guess ${i}` });
    }
    const res = await request(app).post("/api/login").send(OWNER);
    expect(res.status).toBe(429);
    rmSync(dir, { recursive: true, force: true });
  });

  it("is case-insensitive about the email", async () => {
    const { app, dir } = await claimed();
    const res = await request(app)
      .post("/api/login")
      .send({ ...OWNER, email: OWNER.email.toUpperCase() });
    expect(res.status).toBe(200);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("tokens", () => {
  it("are required", async () => {
    const { app, dir } = await claimed();
    expect((await request(app).get("/api/me")).status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("must be genuine", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).get("/api/me").set("Authorization", "Bearer forged.token");
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("cannot be tampered with", async () => {
    const { app, token, dir } = await claimed();
    const [body, sig] = token.split(".");
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    payload.role = "owner";
    payload.userId = "usr-someone-else";
    const forged = `${Buffer.from(JSON.stringify(payload)).toString("base64url")}.${sig}`;

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${forged}`);
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("users and roles", () => {
  it("lets the owner invite a bookkeeper", async () => {
    const { app, token, dir } = await claimed();
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "books@welovemining.co.za", name: "Bookkeeper", role: "bookkeeper" });

    expect(res.status).toBe(200);
    expect(res.body.inviteCode).toHaveLength(8);
    expect(res.body.user.pendingInvite).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("redeems an invite by signing in with the code", async () => {
    const { app, token, dir } = await claimed();
    const invited = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "books@welovemining.co.za", role: "bookkeeper" });

    const res = await request(app).post("/api/login").send({
      email: "books@welovemining.co.za",
      password: "a good long password",
      inviteCode: invited.body.inviteCode,
    });

    expect(res.status).toBe(200);
    expect(res.body.user.pendingInvite).toBe(false);

    // And the password now works on its own.
    const again = await request(app)
      .post("/api/login")
      .send({ email: "books@welovemining.co.za", password: "a good long password" });
    expect(again.status).toBe(200);
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses a wrong invite code", async () => {
    const { app, token, dir } = await claimed();
    await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "books@welovemining.co.za", role: "bookkeeper" });

    const res = await request(app).post("/api/login").send({
      email: "books@welovemining.co.za",
      password: "a good long password",
      inviteCode: "WRONGCOD",
    });
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops a bookkeeper inviting anyone", async () => {
    const { app, token, dir } = await claimed();
    const invited = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "books@welovemining.co.za", role: "bookkeeper" });
    const login = await request(app).post("/api/login").send({
      email: "books@welovemining.co.za",
      password: "a good long password",
      inviteCode: invited.body.inviteCode,
    });

    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ email: "another@x.com", role: "bookkeeper" });
    expect(res.status).toBe(403);
    rmSync(dir, { recursive: true, force: true });
  });

  it("stops the owner deleting themselves", async () => {
    const { app, token, dir } = await claimed();
    const me = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);
    const res = await request(app)
      .delete(`/api/users/${me.body.user.id}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("sync", () => {
  const txn = (id: string, updatedAt: number, amount = 100) => ({
    id,
    updatedAt,
    date: "2026-03-01",
    desc: `entry ${id}`,
    amount,
    debit: "bank",
    credit: "sales",
    recipe: "sale_cash",
  });

  it("accepts a push and hands it back to another device", async () => {
    const { app, token, dir } = await claimed();

    const push = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [txn("t1", 1000), txn("t2", 1100)] } });

    expect(push.status).toBe(200);
    expect(push.body.applied).toBe(2);

    const otherDevice = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: {} });

    expect(otherDevice.body.changes.txns).toHaveLength(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns nothing to a device that is already current", async () => {
    const { app, token, dir } = await claimed();
    const first = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [txn("t1", 1000)] } });

    const second = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: first.body.serverTime, changes: {} });

    expect(second.body.changes.txns).toHaveLength(0);
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the newer edit when two devices change the same entry", async () => {
    const { app, token, dir } = await claimed();
    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [{ ...txn("t1", 2000), desc: "phone" }] } });

    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [{ ...txn("t1", 1000), desc: "stale laptop" }] } });

    const pull = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: {} });

    expect(pull.body.changes.txns[0].desc).toBe("phone");
    rmSync(dir, { recursive: true, force: true });
  });

  it("carries a deletion to other devices", async () => {
    const { app, token, dir } = await claimed();
    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [txn("t1", 1000)] } });

    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [{ ...txn("t1", 2000), deletedAt: 2000 }] } });

    const pull = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: {} });

    expect(pull.body.changes.txns[0].deletedAt).toBe(2000);
    rmSync(dir, { recursive: true, force: true });
  });

  it("syncs settings and the opening balance", async () => {
    const { app, token, dir } = await claimed();
    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({
        since: 0,
        changes: {
          settings: { value: { companyName: "WeLoveMining Pty Ltd" }, updatedAt: 500 },
          openingBank: { value: 250000, updatedAt: 500 },
        },
      });

    const pull = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: {} });

    expect(pull.body.changes.settings.value.companyName).toBe("WeLoveMining Pty Ltd");
    expect(pull.body.changes.openingBank.value).toBe(250000);
    rmSync(dir, { recursive: true, force: true });
  });

  it("lets a viewer read but not write", async () => {
    const { app, token, dir } = await claimed();
    await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${token}`)
      .send({ since: 0, changes: { txns: [txn("t1", 1000)] } });

    const invited = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ email: "viewer@welovemining.co.za", role: "viewer" });
    const login = await request(app).post("/api/login").send({
      email: "viewer@welovemining.co.za",
      password: "a good long password",
      inviteCode: invited.body.inviteCode,
    });

    const res = await request(app)
      .post("/api/sync")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ since: 0, changes: { txns: [txn("sneaky", 9999)] } });

    expect(res.status).toBe(200);
    expect(res.body.readOnly).toBe(true);
    expect(res.body.applied).toBe(0);
    // They can still see the books.
    expect(res.body.changes.txns).toHaveLength(1);
    expect(res.body.changes.txns[0].id).toBe("t1");
    rmSync(dir, { recursive: true, force: true });
  });

  it("refuses to sync without a token", async () => {
    const { app, dir } = await claimed();
    const res = await request(app).post("/api/sync").send({ since: 0, changes: {} });
    expect(res.status).toBe(401);
    rmSync(dir, { recursive: true, force: true });
  });

  it("survives a restart with the data intact", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wlm-restart-"));
    const path = join(dir, "ledger.json");

    const first = createApp(new Store(path, newSecret));
    const claim = await request(first).post("/api/claim").send(OWNER);
    await request(first)
      .post("/api/sync")
      .set("Authorization", `Bearer ${claim.body.token}`)
      .send({ since: 0, changes: { txns: [txn("t1", 1000)] } });

    // Same file, new process.
    const second = createApp(new Store(path, newSecret));
    const login = await request(second).post("/api/login").send(OWNER);
    expect(login.status).toBe(200); // token secret survived, so did the account

    const pull = await request(second)
      .post("/api/sync")
      .set("Authorization", `Bearer ${login.body.token}`)
      .send({ since: 0, changes: {} });
    expect(pull.body.changes.txns).toHaveLength(1);

    rmSync(dir, { recursive: true, force: true });
  });
});

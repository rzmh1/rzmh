import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { randomBytes, randomUUID } from "node:crypto";
import { createApp } from "../server/index.mjs";
import { config } from "../server/config.mjs";
import { hash } from "../server/security.mjs";

test("saved accounts isolate state, CSRF, roles, subscriptions and logout in one browser", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-accounts-"));
  const cfg = config({ DATA_DIR: dir, APP_KEY: randomBytes(32).toString("base64") });
  const app = createApp(cfg);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  cfg.origin = `http://127.0.0.1:${app.server.address().port}`;
  const jar = new Map();
  const request = async (path, { id, csrf, body, method = body ? "POST" : "GET" } = {}) => {
    const response = await fetch(cfg.origin + path, {
      method, headers: {
        Origin: cfg.origin,
        Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
        ...(id ? { "X-Ruzmah-Account": id } : {}),
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      }, body: body ? JSON.stringify(body) : undefined,
    });
    for (const value of response.headers.getSetCookie()) {
      const [key, token] = value.split(";")[0].split("=");
      if (token) jar.set(key, token); else jar.delete(key);
    }
    return { status: response.status, data: await response.json(), headers: response.headers };
  };
  try {
    const register = (name, email, active = {}) => request("/api/auth/register", {
      ...active, body: { name, email, password: "independent-password-123" },
    });
    const first = (await register("الأول", "first@example.test")).data;
    const a = { id: first.user.id, csrf: first.csrf };
    const task = { id: randomUUID(), text: "مهمة الحساب الأول", done: true };
    assert.equal((await request("/api/student/state", { ...a, method: "PUT", body: { tasks: [task] } })).status, 200);
    const second = (await register("الثاني", "second@example.test", a)).data;
    const b = { id: second.user.id, csrf: second.csrf };
    assert.notEqual(first.csrf, second.csrf);
    assert.equal(jar.get(`ruzmah_account_${a.id}`) !== jar.get(`ruzmah_account_${b.id}`), true);
    const available = (await request("/api/auth/accounts", b)).data.accounts;
    assert.deepEqual(new Set(available.map((u) => u.id)), new Set([a.id, b.id]));
    assert.ok(available.every((u) => !u.csrf && !u.password_hash));
    assert.equal((await request("/api/session", a)).data.student.tasks[0].text, task.text);
    assert.deepEqual((await request("/api/session", b)).data.student.tasks, []);
    assert.equal((await request("/api/student/state", { ...b, csrf: a.csrf, method: "PUT", body: { tasks: [] } })).status, 403);
    assert.equal((await request("/api/admin/content", b)).status, 403);
    // A forged/expired selector never silently authenticates as the default account.
    assert.equal((await request("/api/session", { id: randomUUID() })).data.user, null);
    assert.equal((await request("/api/session", { id: "guest" })).data.user, null);
    const subscription = randomUUID();
    app.store.db.prepare("INSERT INTO subscriptions VALUES(?,?,?,?,?,?,NULL)")
      .run(subscription, a.id, "year", new Date().toISOString(), new Date(Date.now() + 86400000).toISOString(), "active");
    assert.equal((await request("/api/session", a)).data.entitled, true);
    assert.equal((await request("/api/session", b)).data.entitled, false);
    // Session revocation for A must not touch B.
    const oldToken = jar.get(`ruzmah_account_${a.id}`);
    assert.equal((await request("/api/auth/logout", { ...a, body: {} })).status, 200);
    assert.equal(app.store.db.prepare("SELECT hash FROM sessions WHERE hash=?").get(hash(oldToken)), undefined);
    assert.equal((await request("/api/session", a)).data.user, null);
    assert.equal((await request("/api/session", b)).data.user.id, b.id);
    assert.equal((await request("/api/auth/accounts", b)).data.accounts.length, 1);
    // Logging back in recovers server-owned progress; no account or study data was deleted.
    const again = (await request("/api/auth/login", { ...b, body: {
      email: "first@example.test", password: "independent-password-123",
    } })).data;
    assert.equal(again.user.id, a.id);
    assert.equal(again.student.tasks[0].text, task.text);
    assert.equal(again.student.subscription.id, subscription);
    const failed = await request("/api/auth/login", { ...b, body: { email: "first@example.test", password: "wrong" } });
    assert.equal(failed.status, 401);
    assert.equal((await request("/api/session", b)).data.user.id, b.id);
    // A legacy pre-upgrade cookie gains a named cookie, without rotating its session.
    const token = jar.get(`ruzmah_account_${a.id}`);
    jar.clear(); jar.set("ruzmah_session", token);
    const migrated = await request("/api/session");
    assert.equal(migrated.data.user.id, a.id);
    assert.equal(jar.get(`ruzmah_account_${a.id}`), token);
    assert.match(migrated.headers.get("set-cookie"), /HttpOnly; SameSite=Lax/);
    // A public selector cannot grant file access; native downloads still need its session.
    const assetId = randomUUID();
    app.store.db.prepare("INSERT INTO assets(id,owner_id,name,mime,size,storage,object_key,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .run(assetId, a.id, "private.pdf", "application/pdf", 4, "local", "private.pdf", "ready", new Date().toISOString());
    assert.equal((await request(`/api/media/${assetId}?account=guest`)).status, 401);
    assert.equal((await request(`/api/media/${assetId}?account=${a.id}`)).status, 403);
    // Disabled accounts disappear and cannot fall back to another valid browser cookie.
    app.store.db.prepare("UPDATE users SET disabled=1 WHERE id=?").run(a.id);
    assert.equal((await request("/api/session", a)).data.user, null);
    assert.equal((await request("/api/auth/accounts")).data.accounts.length, 0);
    app.store.db.prepare("UPDATE users SET disabled=0 WHERE id=?").run(a.id);
    // Password-reset-style session revocation removes only the selected user's sessions.
    app.store.db.prepare("DELETE FROM sessions WHERE user_id=?").run(a.id);
    assert.equal((await request("/api/session", a)).data.user, null);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

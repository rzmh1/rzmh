import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { createApp } from "../server/index.mjs";
import { config } from "../server/config.mjs";
import {
  passwordHash,
  passwordVerify,
  encrypt,
  decrypt,
} from "../server/security.mjs";
import { addMonths, activateOrder, verifyStripeSignature } from "../server/payments.mjs";
import { frame } from "../server/custom.mjs";
import { tutor, aiRequest } from "../server/ai.mjs";
import { once } from "node:events";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-test-"));
  const cfg = config({
    DATA_DIR: dir,
    APP_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: "http://127.0.0.1:3000",
  });
  const app = createApp(cfg);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  cfg.origin = "http://127.0.0.1:" + app.server.address().port;
  const adminId = randomUUID();
  app.store.db
    .prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)",
    )
    .run(
      adminId,
      "owner@example.test",
      "مالك رُزمة",
      await passwordHash("a-very-long-test-password"),
      "admin",
      new Date().toISOString(),
    );
  return {
    ...app,
    cfg,
    adminId,
    async close() {
      app.server.close();
      await once(app.server, "close");
      await rm(dir, { recursive: true, force: true });
    },
  };
}
async function browser(f) {
  let cookie = "",
    csrf = "";
  return {
    async request(
      path,
      { method = "GET", body, headers = {}, raw = false } = {},
    ) {
      const res = await fetch(f.cfg.origin + path, {
        method,
        headers: {
          Origin: f.cfg.origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...(!raw && body ? { "Content-Type": "application/json" } : {}),
          ...headers,
        },
        body:
          body === undefined ? undefined : raw ? body : JSON.stringify(body),
        redirect: "manual",
      });
      if (res.headers.get("set-cookie"))
        cookie = res.headers.get("set-cookie").split(";")[0];
      const data = await res.json().catch(() => null);
      if (data?.csrf) csrf = data.csrf;
      return { status: res.status, data, headers: res.headers };
    },
    get cookie() {
      return cookie;
    },
  };
}

test("real auth, role checks, shared content, fixed prices, CSRF, grading, protected uploads and custom code", async () => {
  const f = await fixture();
  try {
    const owner = await browser(f),
      student = await browser(f),
      guest = await browser(f);
    assert.equal((await guest.request("/api/admin/stats")).status, 401);
    assert.equal(
      (
        await student.request("/api/auth/register", {
          method: "POST",
          body: {
            email: "student@example.test",
            name: "طالب",
            password: "a-long-student-password",
            role: "admin",
          },
        })
      ).data.user.role,
      "student",
    );
    assert.equal((await student.request("/api/admin/stats")).status, 403);
    assert.equal(
      (
        await owner.request("/api/auth/login", {
          method: "POST",
          body: {
            email: "owner@example.test",
            password: "a-very-long-test-password",
          },
        })
      ).data.user.role,
      "admin",
    );
    assert(owner.cookie.startsWith("ruzmah_session="));
    const content = (await owner.request("/api/admin/content")).data;
    content.brand.name = "رُزمة المطورة";
    content.courses[0].lessons.push({
      id: "paid-lesson",
      title: "درس مشترك",
      body: "PRIVATE LESSON",
      free: false,
      visible: true,
    });
    assert.equal(
      (
        await owner.request("/api/admin/content", {
          method: "PUT",
          body: content,
        })
      ).status,
      200,
    );
    const publicContent = (await guest.request("/api/content")).data;
    assert.equal(publicContent.brand.name, "رُزمة المطورة");
    assert.equal(publicContent.courses[0].lessons[1].body, "");
    assert(publicContent.courses[0].lessons[1].locked);
    assert.equal(
      (
        await owner.request("/api/admin/content", {
          method: "PUT",
          body: content,
        })
      ).status,
      409,
    );
    const latest = (await owner.request("/api/admin/content")).data;
    latest.plans[0].price = 1;
    assert.equal(
      (
        await owner.request("/api/admin/content", {
          method: "PUT",
          body: latest,
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await owner.request("/api/admin/backup", {
          method: "POST",
          body: {},
          headers: { "X-CSRF-Token": "bad" },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await owner.request("/api/admin/backup", {
          method: "POST",
          body: {},
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    const practice = await student.request("/api/practice", {
      method: "POST",
      body: { id: "q1", choice: 0 },
    });
    assert.equal(practice.data.correct, 1);
    assert(practice.data.student.mistakes.includes("q1"));
    const attempt = await student.request("/api/tests/start", {
      method: "POST",
      body: { id: "foundation-check" },
    });
    assert.equal(attempt.status, 200);
    assert(!("correct" in attempt.data.questions[0]));
    await student.request("/api/attempts/" + attempt.data.id + "/answer", {
      method: "POST",
      body: { id: "q1", choice: 1 },
    });
    const result = await student.request(
      "/api/attempts/" + attempt.data.id + "/finish",
      { method: "POST", body: { correct: 999 } },
    );
    assert.equal(result.data.result.correct, 1);
    assert.equal(result.data.result.total, 3);
    const duplicate = await student.request(
      "/api/attempts/" + attempt.data.id + "/finish",
      { method: "POST", body: {} },
    );
    assert.equal(duplicate.data.result.correct, 1);
    const upload = await owner.request("/api/admin/assets/init", {
      method: "POST",
      body: {
        name: "test.pdf",
        mime: "application/pdf",
        size: 8,
        courseId: "quant-basics",
        lessonId: "paid-lesson",
      },
    });
    assert.equal(upload.status, 200);
    const bytes = await owner.request(
      "/api/admin/assets/" + upload.data.id + "/bytes",
      {
        method: "PUT",
        body: Buffer.from("%PDF-1.4"),
        raw: true,
        headers: { "Content-Type": "application/pdf" },
      },
    );
    assert.equal(bytes.status, 200);
    assert.equal(
      (
        await owner.request(
          "/api/admin/assets/" + upload.data.id + "/complete",
          { method: "POST", body: { parts: [] } },
        )
      ).data.status,
      "ready",
    );
    assert.equal(
      (await guest.request("/api/media/" + upload.data.id)).status,
      401,
    );
    assert.equal(
      (await student.request("/api/media/" + upload.data.id)).status,
      403,
    );
    assert.equal(
      (
        await owner.request("/api/admin/assets/" + upload.data.id + "/link", {
          method: "POST",
          body: { courseId: "quant-basics", lessonId: "paid-lesson" },
        })
      ).status,
      200,
    );
    const userId = (await student.request("/api/session")).data.user.id;
    assert.equal(
      (
        await owner.request("/api/admin/subscriptions", {
          method: "POST",
          body: { userId, planId: "month", days: 30 },
        })
      ).status,
      200,
    );
    assert.equal(
      (await student.request("/api/content")).data.courses[0].lessons[1].body,
      "PRIVATE LESSON",
    );
    const pdf = await student.request("/api/media/" + upload.data.id, {
      headers: { Range: "bytes=0-3" },
    });
    assert.equal(pdf.status, 206);
    assert.equal(pdf.headers.get("content-range"), "bytes 0-3/8");
    const custom = await owner.request("/api/admin/custom", {
      method: "POST",
      body: {
        scope: "home",
        html: "<b>رُزمة</b>",
        css: "b{color:purple}",
        js: 'document.body.dataset.ok="yes"',
        height: 300,
        publish: true,
      },
    });
    assert.equal(custom.status, 200);
    assert.equal(
      (await student.request("/api/admin/custom", { method: "POST", body: {} }))
        .status,
      403,
    );
    const rawFrame = await fetch(
      f.cfg.origin + "/custom/published/" + custom.data.id,
    );
    const csp = rawFrame.headers.get("content-security-policy");
    assert(csp.includes("sandbox allow-scripts"));
    assert(!csp.includes("allow-same-origin"));
    assert(csp.includes("connect-src 'none'"));
    assert.equal(
      (
        await owner.request("/api/admin/settings/ai", {
          method: "PUT",
          body: {
            enabled: false,
            provider: "openai",
            model: "gpt-4.1-mini",
            dailyLimit: 7,
            maxTokens: 1200,
            temperature: null,
            instructions: "اختبار",
            apiKey: "test-key-for-encryption",
          },
        })
      ).status,
      200,
    );
    const setting = (await owner.request("/api/admin/settings/ai")).data;
    assert(setting.hasSecrets.apiKey);
    assert(!("secrets" in setting));
    assert(!JSON.stringify(setting).includes("test-key-for-encryption"));
    assert.equal((await guest.request("/api/admin/settings/ai")).status, 401);
    assert.equal(
      (
        await student.request("/api/checkout", {
          method: "POST",
          body: { planId: "month", consent: true, amount: 1 },
        })
      ).status,
      503,
    );
    assert.equal(
      (await owner.request("/api/admin/backup", { method: "POST", body: {} }))
        .status,
      200,
    );
    const stats = (await owner.request("/api/admin/stats")).data;
    assert.equal(stats.students, 1);
    assert.equal(stats.total, 0);
    assert.equal(stats.tests, 1);
  } finally {
    await f.close();
  }
});

test("payment signatures, amount verification, test/live separation and idempotency", async () => {
  const f = await fixture();
  try {
    assert.equal(
      addMonths("2026-01-31T00:00:00Z", 1).toISOString(),
      "2026-02-28T00:00:00.000Z",
    );
    const user = f.adminId;
    const key = "webhook-test",
      time = Math.floor(Date.now() / 1000),
      raw = Buffer.from(JSON.stringify({ id: "evt" })),
      sig = createHmac("sha256", key)
        .update(time + ".")
        .update(raw)
        .digest("hex");
    assert.equal(
      verifyStripeSignature(raw, `t=${time},v1=${sig}`, key).id,
      "evt",
    );
    assert.throws(() => verifyStripeSignature(raw, `t=${time},v1=bad`, key));
    assert.throws(() =>
      verifyStripeSignature(raw, `t=${time - 1000},v1=${sig}`, key),
    );
    for (const mode of ["test", "live"]) {
      const id = randomUUID(),
        providerId = "cs_" + randomUUID();
      f.store.db
        .prepare(
          "INSERT INTO orders(id,user_id,plan_id,amount,status,provider,provider_id,mode,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id,
          user,
          "year",
          9999,
          "pending",
          "stripe",
          providerId,
          mode,
          new Date().toISOString(),
        );
      const session = {
        id: providerId,
        client_reference_id: id,
        amount_total: 9999,
        currency: "sar",
        payment_status: "paid",
        livemode: mode === "live",
      };
      assert.throws(() =>
        activateOrder(f.store, id, "wrong-" + id, {
          ...session,
          amount_total: 1999,
        }),
      );
      activateOrder(f.store, id, "evt-" + id, session);
      activateOrder(f.store, id, "evt-" + id, session);
      activateOrder(f.store, id, "new-event-" + id, session);
      assert.equal(
        f.store.db
          .prepare("SELECT count(*) n FROM subscriptions WHERE order_id=?")
          .get(id).n,
        mode === "live" ? 1 : 0,
      );
    }
  } finally {
    await f.close();
  }
});

test("AI Responses payload, saved context, service errors and atomic daily limit (mock HTTP only)", async () => {
  const f = await fixture();
  const original = globalThis.fetch;
  try {
    const s = f.store.setting("ai");
    f.store.saveSetting(
      "ai",
      { ...s, secrets: undefined, enabled: true, dailyLimit: 1 },
      { apiKey: "not-a-real-key" },
    );
    const user = f.store.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(f.adminId);
    let body;
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      body = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          id: "resp_mock",
          output: [
            {
              type: "message",
              content: [{ type: "output_text", text: "شرح في اختبار آلي" }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const value = await tutor(f.store, user, { message: "اشرح النسبة" });
    assert.equal(value.remaining, 0);
    assert.equal(body.store, false);
    assert(body.instructions.includes("رُزمة"));
    assert.equal(
      f.store.db.prepare("SELECT count(*) n FROM messages").get().n,
      2,
    );
    await assert.rejects(
      tutor(f.store, user, { message: "سؤال آخر" }),
      (e) => e.status === 429,
    );
    const future = aiRequest({ ...s, model: "o3", temperature: 1 }, []);
    assert(!("temperature" in future));
  } finally {
    globalThis.fetch = original;
    await f.close();
  }
});

test("secrets use authenticated encryption and custom frames isolate scripts", async () => {
  const key = randomBytes(32).toString("base64"),
    cipher = encrypt("private-key", key);
  assert(!cipher.includes("private-key"));
  assert.equal(decrypt(cipher, key), "private-key");
  assert.throws(() => decrypt(cipher, randomBytes(32).toString("base64")));
  const hashed = await passwordHash("a-strong-test-password");
  assert(await passwordVerify("a-strong-test-password", hashed));
  assert(!(await passwordVerify("different", hashed)));
  const out = frame({
    html: "<h1>رُزمة</h1>",
    css: "",
    js: 'console.log("ok")',
  });
  assert(out.csp.includes("default-src 'none'"));
  assert(out.html.includes("nonce="));
});

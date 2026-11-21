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
      studentSignIn = await browser(f),
      guest = await browser(f);
    f.store.db
      .prepare("INSERT INTO rate_limits VALUES(?,?,?)")
      .run("expired-test-entry", 1, Date.now() - 1);
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
    assert.equal(
      f.store.db
        .prepare("SELECT key FROM rate_limits WHERE key=?")
        .get("expired-test-entry"),
      undefined,
      "expired rate-limit records are cleaned on the next rate-limited request",
    );
    const studentLogin = await studentSignIn.request("/api/auth/login", {
      method: "POST",
      body: {
        email: "student@example.test",
        password: "a-long-student-password",
      },
    });
    assert.equal(studentLogin.status, 200);
    assert.equal(studentLogin.data.user.role, "student");
    assert.equal((await student.request("/api/admin/stats")).status, 403);
    assert.equal(
      (
        await student.request("/api/auth/admin-login", {
          method: "POST",
          body: {
            email: "student@example.test",
            password: "a-long-student-password",
          },
        })
      ).status,
      401,
      "student credentials must never authenticate through the owner login endpoint",
    );
    assert.equal(
      (
        await guest.request("/api/auth/login", {
          method: "POST",
          body: {
            email: "owner@example.test",
            password: "a-very-long-test-password",
          },
        })
      ).status,
      401,
      "owner accounts must not authenticate through the student login endpoint",
    );
    assert.equal(
      (
        await guest.request("/api/auth/admin-login", {
          method: "POST",
          body: {
            email: "owner@example.test",
            password: "incorrect-owner-password",
          },
        })
      ).status,
      401,
      "an owner email without the correct password must be rejected",
    );
    assert.equal(
      (
        await owner.request("/api/auth/admin-login", {
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


test("student reports stay private until moderator review and publish only redacted copy", async () => {
  const f = await fixture();
  try {
    const owner = await browser(f),
      student = await browser(f),
      guest = await browser(f);
    await owner.request("/api/auth/login", {
      method: "POST",
      body: {
        email: "owner@example.test",
        password: "a-very-long-test-password",
      },
    });
    const registration = await student.request("/api/auth/register", {
      method: "POST",
      body: {
        email: "reports@example.test",
        name: "طالب تجريبي",
        password: "a-long-student-password",
      },
    });
    assert.equal(registration.status, 200);
    assert.equal((await guest.request("/api/leaks")).status, 401);
    assert.equal(
      (
        await student.request("/api/leaks", {
          method: "POST",
          body: {
            track: "qudrat",
            subject: "quantitative",
            topic: "النسب",
            description: "أتذكر أن الفكرة كانت عن التناسب العكسي وتغير الكميات.",
            rightsConfirmed: true,
          },
        })
      ).status,
      403,
    );
    const userId = registration.data.user.id;
    assert.equal(
      (
        await owner.request("/api/admin/subscriptions", {
          method: "POST",
          body: { userId, planId: "month", days: 30 },
        })
      ).status,
      200,
    );
    const submission = await student.request("/api/leaks", {
      method: "POST",
      body: {
        track: "qudrat",
        subject: "quantitative",
        topic: "النسب",
        description: "أتذكر أن الفكرة كانت عن التناسب العكسي وتغير الكميات.",
        examDate: "2026-11-20",
        rightsConfirmed: true,
      },
    });
    assert.equal(submission.status, 201);
    assert.equal(submission.data.status, "pending");
    assert.equal((await student.request("/api/leaks")).data.items.length, 0);
    const pending = await owner.request("/api/admin/leaks");
    assert.equal(pending.data.length, 1);
    assert.equal(pending.data[0].status, "pending");
    assert.equal(pending.data[0].submitter, "طالب تجريبي");
    assert.equal(
      (
        await owner.request("/api/admin/leaks/" + submission.data.id + "/review", {
          method: "POST",
          body: { status: "approved" },
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await owner.request("/api/admin/leaks/" + submission.data.id + "/review", {
          method: "POST",
          body: {
            status: "approved",
            publicTopic: "التناسب العكسي",
            publicDescription: "تجربة طالب حول مهارة التناسب العكسي وتغير الكميات.",
          },
        })
      ).status,
      200,
    );
    const published = await student.request("/api/leaks");
    assert.equal(published.data.items.length, 1);
    assert.equal(published.data.items[0].topic, "التناسب العكسي");
    assert.equal(
      published.data.items[0].description,
      "تجربة طالب حول مهارة التناسب العكسي وتغير الكميات.",
    );
    assert.equal(
      (
        await student.request("/api/leaks/" + submission.data.id + "/report", {
          method: "POST",
          body: { reason: "inaccurate" },
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await student.request("/api/leaks/" + submission.data.id + "/report", {
          method: "POST",
          body: { reason: "inaccurate" },
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await student.request("/api/leaks", {
          method: "POST",
          body: {
            track: "qudrat",
            subject: "quantitative",
            topic: "موضوع آخر",
            description: "وصف واضح لتجربة الطالب مع موضوع تدريبي مختلف.",
            rightsConfirmed: false,
          },
        })
      ).status,
      400,
    );
  } finally {
    await f.close();
  }
});


test("email verification and password recovery require one-time expiring codes", async () => {
  const f = await fixture(),
    originalFetch = globalThis.fetch;
  let sent = [];
  try {
    f.cfg.requireEmailVerification = true;
    f.cfg.mail = {
      apiKey: "test-resend-key",
      from: "رُزمة <noreply@example.test>",
    };
    globalThis.fetch = async (url, options) => {
      if (url === "https://api.resend.com/emails") {
        assert.equal(options.headers.Authorization, "Bearer test-resend-key");
        const payload = JSON.parse(options.body);
        sent.push(payload);
        return new Response(JSON.stringify({ id: "email_test" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return originalFetch(url, options);
    };
    const student = await browser(f);
    const registration = await student.request("/api/auth/register", {
      method: "POST",
      body: {
        email: "verify@example.test",
        name: "طالب تحقق",
        password: "a-long-student-password",
      },
    });
    assert.equal(registration.status, 201);
    assert.equal(registration.data.verificationRequired, true);
    assert.equal(registration.data.email, "verify@example.test");
    assert.equal(sent.length, 1);
    assert.match(sent[0].text, /\d{6}/);
    assert.equal(
      (
        await student.request("/api/auth/login", {
          method: "POST",
          body: {
            email: "verify@example.test",
            password: "a-long-student-password",
          },
        })
      ).status,
      403,
    );
    const verificationCode = sent[0].text.match(/(\d{6})/)[1];
    assert.equal(
      (
        await student.request("/api/auth/verify-email", {
          method: "POST",
          body: { email: "verify@example.test", code: "000000" },
        })
      ).status,
      400,
    );
    const verified = await student.request("/api/auth/verify-email", {
      method: "POST",
      body: { email: "verify@example.test", code: verificationCode },
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.data.user.email, "verify@example.test");
    assert(student.cookie.startsWith("ruzmah_session="));
    assert.equal(
      (
        await student.request("/api/auth/verify-email", {
          method: "POST",
          body: { email: "verify@example.test", code: verificationCode },
        })
      ).status,
      400,
    );

    const requested = await student.request("/api/auth/forgot-password", {
      method: "POST",
      body: { email: "verify@example.test" },
    });
    assert.equal(requested.status, 200);
    assert.match(requested.data.message, /إذا كان البريد/);
    assert.equal(sent.length, 2);
    const resetCode = sent[1].text.match(/(\d{6})/)[1];
    const reset = await student.request("/api/auth/reset-password", {
      method: "POST",
      body: {
        email: "verify@example.test",
        code: resetCode,
        password: "a-new-strong-password",
      },
    });
    assert.equal(reset.status, 200);
    assert.equal((await student.request("/api/session")).data.user, null);
    const login = await browser(f);
    assert.equal(
      (
        await login.request("/api/auth/login", {
          method: "POST",
          body: {
            email: "verify@example.test",
            password: "a-long-student-password",
          },
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await login.request("/api/auth/login", {
          method: "POST",
          body: {
            email: "verify@example.test",
            password: "a-new-strong-password",
          },
        })
      ).status,
      200,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await f.close();
  }
});

test("production email verification refuses signup when mail delivery is not configured", async () => {
  const f = await fixture();
  try {
    f.cfg.requireEmailVerification = true;
    f.cfg.mail = { apiKey: "", from: "" };
    const student = await browser(f);
    const result = await student.request("/api/auth/register", {
      method: "POST",
      body: {
        email: "not-created@example.test",
        name: "حساب غير منشأ",
        password: "a-long-student-password",
      },
    });
    assert.equal(result.status, 503);
    assert.equal(
      f.store.db.prepare("SELECT count(*) n FROM users WHERE email=?").get("not-created@example.test").n,
      0,
    );
  } finally {
    await f.close();
  }
});


test("AI tutor accepts bounded educational image input without storing image bytes", async () => {
  const f = await fixture(),
    originalFetch = globalThis.fetch;
  let requestBody;
  try {
    const settings = f.store.setting("ai");
    f.store.saveSetting(
      "ai",
      { ...settings, secrets: undefined, enabled: true, dailyLimit: 3 },
      { apiKey: "not-a-real-key" },
    );
    const user = f.store.db.prepare("SELECT * FROM users WHERE id=?").get(f.adminId);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      requestBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          id: "resp_image_mock",
          output: [{ type: "message", content: [{ type: "output_text", text: "قرأت السؤال في الصورة." }] }],
          usage: { input_tokens: 20, output_tokens: 10 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1XcAAAAASUVORK5CYII=";
    const result = await tutor(f.store, user, {
      message: "استخرج السؤال واشرح الإجابة الصحيحة.",
      image: { name: "question.png", mimeType: "image/png", data: png },
    });
    assert.equal(result.text, "قرأت السؤال في الصورة.");
    const content = requestBody.input.at(-1).content;
    assert.equal(content[0].type, "input_text");
    assert.equal(content[1].type, "input_image");
    assert(content[1].image_url.startsWith("data:image/png;base64,"));
    const saved = f.store.db.prepare("SELECT content FROM messages WHERE role='user'").get().content;
    assert(saved.includes("question.png"));
    assert(!saved.includes(png));
    await assert.rejects(
      tutor(f.store, user, {
        message: "حل الصورة",
        image: { name: "spoof.jpg", mimeType: "image/jpeg", data: png },
      }),
      (err) => err.status === 400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await f.close();
  }
});


test("AI tutor accepts bounded PDF input and keeps document bytes out of conversation history", async () => {
  const f = await fixture(),
    originalFetch = globalThis.fetch;
  let requestBody;
  try {
    const settings = f.store.setting("ai");
    f.store.saveSetting(
      "ai",
      { ...settings, secrets: undefined, enabled: true, dailyLimit: 3 },
      { apiKey: "not-a-real-key" },
    );
    const user = f.store.db.prepare("SELECT * FROM users WHERE id=?").get(f.adminId);
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.openai.com/v1/responses");
      requestBody = JSON.parse(options.body);
      return new Response(
        JSON.stringify({
          id: "resp_pdf_mock",
          output: [{ type: "message", content: [{ type: "output_text", text: "راجعت ملف الدرس." }] }],
          usage: { input_tokens: 30, output_tokens: 12 },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const pdf = Buffer.from("%PDF-1.4\n%Ruzmah educational test", "ascii").toString("base64");
    const result = await tutor(f.store, user, {
      message: "استخرج الفكرة واشرح الرسم.",
      file: { name: "lesson.pdf", mimeType: "application/pdf", data: pdf },
    });
    assert.equal(result.text, "راجعت ملف الدرس.");
    const content = requestBody.input.at(-1).content;
    assert.equal(content[0].type, "input_text");
    assert.equal(content[1].type, "input_file");
    assert.equal(content[1].filename, "lesson.pdf");
    assert(content[1].file_data.startsWith("data:application/pdf;base64,"));
    const saved = f.store.db.prepare("SELECT content FROM messages WHERE role='user'").get().content;
    assert(saved.includes("lesson.pdf"));
    assert(!saved.includes(pdf));
    await assert.rejects(
      tutor(f.store, user, {
        message: "حل الملف",
        file: { name: "fake.pdf", mimeType: "application/pdf", data: Buffer.from("not a PDF").toString("base64") },
      }),
      (err) => err.status === 400,
    );
  } finally {
    globalThis.fetch = originalFetch;
    await f.close();
  }
});


test("admin broadcasts only to active verified subscribers after fresh preview and confirmation", async () => {
  const f = await fixture(),
    originalFetch = globalThis.fetch;
  let batchPayload = null,
    batchCalls = 0;
  try {
    f.cfg.mail = {
      apiKey: "test-resend-key",
      from: "رُزمة <noreply@example.test>",
    };
    globalThis.fetch = async (url, options) => {
      if (url === "https://api.resend.com/emails/batch") {
        batchCalls += 1;
        assert.equal(options.headers.Authorization, "Bearer test-resend-key");
        assert.match(options.headers["Idempotency-Key"], /^broadcast\//);
        batchPayload = JSON.parse(options.body);
        return new Response(
          JSON.stringify({ data: batchPayload.map((_, i) => ({ id: "batch_email_" + i })) }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return originalFetch(url, options);
    };
    const admin = await browser(f);
    await admin.request("/api/auth/login", {
      method: "POST",
      body: { email: "owner@example.test", password: "a-very-long-test-password" },
    });
    const active = await browser(f),
      pending = await browser(f);
    const activeUser = await active.request("/api/auth/register", {
      method: "POST",
      body: { email: "active-broadcast@example.test", name: "مشترك نشط", password: "a-long-student-password" },
    });
    const pendingUser = await pending.request("/api/auth/register", {
      method: "POST",
      body: { email: "unverified-broadcast@example.test", name: "بريد غير مؤكد", password: "a-long-student-password" },
    });
    for (const userId of [activeUser.data.user.id, pendingUser.data.user.id]) {
      assert.equal(
        (
          await admin.request("/api/admin/subscriptions", {
            method: "POST",
            body: { userId, planId: "month", days: 30 },
          })
        ).status,
        200,
      );
    }
    f.store.db.prepare("UPDATE users SET email_verified=0 WHERE id=?").run(pendingUser.data.user.id);
    const draft = {
      subject: "تحديث مهم في رُزمة",
      message: "تمت إضافة تحسينات مهمة إلى المنصة. افتح حسابك للاطلاع على التفاصيل.",
      serviceOnly: true,
    };
    const preview = await admin.request("/api/admin/broadcasts/preview", {
      method: "POST",
      body: draft,
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.data.recipientCount, 1);
    assert.match(preview.data.previewToken, /^[0-9]+[.][a-f0-9]{64}$/);
    assert.equal(batchCalls, 0);
    assert.equal(
      (
        await admin.request("/api/admin/broadcasts/send", {
          method: "POST",
          body: { ...draft, confirmCount: 2, previewToken: preview.data.previewToken },
        })
      ).status,
      409,
    );
    assert.equal(batchCalls, 0);
    assert.equal(
      (
        await admin.request("/api/admin/broadcasts/send", {
          method: "POST",
          body: { ...draft, confirmCount: preview.data.recipientCount },
        })
      ).status,
      409,
    );
    assert.equal(batchCalls, 0);
    const sent = await admin.request("/api/admin/broadcasts/send", {
      method: "POST",
      body: { ...draft, confirmCount: preview.data.recipientCount, previewToken: preview.data.previewToken },
    });
    assert.equal(sent.status, 201, JSON.stringify(sent.data));
    assert.equal(sent.data.sentCount, 1);
    assert.equal(batchCalls, 1);
    assert.equal(batchPayload.length, 1);
    assert.deepEqual(batchPayload[0].to, ["active-broadcast@example.test"]);
    const history = await admin.request("/api/admin/broadcasts");
    assert.equal(history.data[0].status, "sent");
    assert.equal(history.data[0].recipient_count, 1);
    assert.equal(
      (
        await admin.request("/api/admin/broadcasts/send", {
          method: "POST",
          body: { ...draft, confirmCount: 1, previewToken: preview.data.previewToken },
        })
      ).status,
      429,
    );
    assert.equal(batchCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await f.close();
  }
});


test("Resend broadcast delivery chunks recipients into idempotent batches of at most 100", async () => {
  const { sendBatchEmails } = await import("../server/email.mjs"),
    originalFetch = globalThis.fetch,
    sizes = [],
    keys = [];
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "https://api.resend.com/emails/batch");
      const payload = JSON.parse(options.body);
      sizes.push(payload.length);
      keys.push(options.headers["Idempotency-Key"]);
      return new Response(
        JSON.stringify({ data: payload.map((_, i) => ({ id: "id_" + sizes.length + "_" + i })) }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const recipients = Array.from({ length: 101 }, (_, i) => ({
      id: "student_" + i,
      email: "student" + i + "@example.test",
    }));
    const result = await sendBatchEmails(
      { mail: { apiKey: "test-key", from: "رُزمة <noreply@example.test>" } },
      recipients,
      { subject: "تحديث", text: "رسالة تشغيلية للمشتركين.", batchId: "broadcast-test-id" },
    );
    assert.deepEqual(sizes, [100, 1]);
    assert.equal(new Set(keys).size, 2);
    assert.equal(result.sentCount, 101);
    assert.equal(result.providerIds.length, 101);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, randomBytes, createHmac } from "node:crypto";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { createApp } from "../server/index.mjs";
import { config } from "../server/config.mjs";
import { passwordHash } from "../server/security.mjs";
import { addMonths } from "../server/payments.mjs";
import { storeConfig } from "../dist/store-config.js";
const exec = promisify(execFile);

test("store journey: admin content, measured videos, authenticated single preview, protected bytes, verified checkout and failure", async () => {
  const nativeFetch = globalThis.fetch,
    dir = await mkdtemp(join(tmpdir(), "ruzmah-store-")),
    cfg = config({
      DATA_DIR: dir,
      APP_KEY: randomBytes(32).toString("base64"),
      APP_ORIGIN: "http://127.0.0.1:3000",
    }),
    app = createApp(cfg);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  cfg.origin = "http://127.0.0.1:" + app.server.address().port;
  const ownerId = randomUUID();
  app.store.db
    .prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,'admin',?)",
    )
    .run(
      ownerId,
      "store-owner@example.test",
      "مالك الاختبار",
      await passwordHash("store-test-password-123"),
      new Date().toISOString(),
    );
  function client() {
    let cookie = "",
      csrf = "";
    return {
      async req(path, method = "GET", body, extra = {}) {
        const raw = Buffer.isBuffer(body),
          r = await nativeFetch(cfg.origin + path, {
            method,
            headers: {
              Origin: cfg.origin,
              ...(cookie ? { Cookie: cookie } : {}),
              ...(csrf ? { "X-CSRF-Token": csrf } : {}),
              ...(body
                ? {
                    "Content-Type": raw
                      ? "application/octet-stream"
                      : "application/json",
                  }
                : {}),
              ...extra,
            },
            body:
              body === undefined
                ? undefined
                : raw
                  ? body
                  : JSON.stringify(body),
          });
        const data = r.headers.get("content-type")?.includes("application/json")
          ? await r.json()
          : Buffer.from(await r.arrayBuffer());
        if (r.headers.get("set-cookie"))
          cookie = r.headers.get("set-cookie").split(";")[0];
        if (data?.csrf) csrf = data.csrf;
        return { status: r.status, data, headers: r.headers };
      },
      async ok(path, method = "GET", body) {
        const r = await this.req(path, method, body);
        assert.equal(r.status, 200, path + " " + JSON.stringify(r.data));
        return r.data;
      },
    };
  }
  const owner = client(),
    guest = client(),
    student = client(),
    failedStudent = client();
  try {
    assert.equal((await guest.req("/")).status, 200);
    await owner.ok("/api/auth/admin-login", "POST", {
      email: "store-owner@example.test",
      password: "store-test-password-123",
    });
    const source = await owner.ok("/api/admin/learning/instructors", "POST", {
      name: "مصدر محتوى للاختبار",
      bio: "سجل اختبار مؤقت",
      specialty: "الكمي",
      kind: "teacher",
      published: true,
      sectionIds: ["qudrat"],
    });
    let content = await owner.ok("/api/admin/content");
    content.courses.push({
      id: "store-course",
      title: "دورة منشورة للاختبار",
      description: "بيانات اختبار مؤقتة",
      sectionId: "qudrat",
      subject: "كمي",
      trackId: "qudrat-quant",
      instructorId: source.id,
      stage: "foundation",
      status: "منشورة",
      access: "paid",
      visible: true,
      order: 10,
      art: "math",
      previewLessonId: "clip-1",
      lessons: Array.from({ length: 3 }, (_, i) => ({
        id: "clip-" + (i + 1),
        title: "عنوان المقطع " + (i + 1),
        body: "شرح محمي " + i,
        free: true,
        visible: true,
        order: i + 1,
      })),
    });
    await owner.ok("/api/admin/content", "PUT", content);
    const input = join(dir, "source.mp4");
    await exec("ffmpeg", [
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=purple:s=320x240:d=1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      input,
    ]);
    const bytes = await readFile(input),
      assets = [];
    for (let i = 1; i <= 3; i++) {
      const upload = await owner.ok("/api/admin/assets/init", "POST", {
        name: "clip-" + i + ".mp4",
        mime: "video/mp4",
        size: bytes.length,
        courseId: "store-course",
        lessonId: "clip-" + i,
      });
      assets.push(upload.id);
      assert.equal(
        (
          await owner.req(
            "/api/admin/assets/" + upload.id + "/bytes",
            "PUT",
            bytes,
          )
        ).status,
        200,
      );
      await owner.ok("/api/admin/assets/" + upload.id + "/complete", "POST", {
        parts: [],
      });
      await owner.ok("/api/admin/assets/" + upload.id + "/link", "POST", {
        courseId: "store-course",
        lessonId: "clip-" + i,
      });
    }
    for (let i = 0; i < 150; i++) {
      const rows = await owner.ok("/api/admin/assets");
      if (
        assets.every((id) =>
          rows.some((a) => a.id === id && a.status === "ready"),
        )
      )
        break;
      await delay(30);
    }
    const publicData = await guest.ok("/api/content"),
      course = publicData.courses.find((c) => c.id === "store-course");
    assert.equal(course.instructorId, source.id);
    assert.equal(course.lessons.length, 3);
    assert(course.lessons.every((l) => l.durationSeconds > 0 && l.video));
    assert(
      course.lessons.every(
        (l) =>
          l.body === "" && l.videoAssetId === "" && l.locked && l.requiresLogin,
      ),
    );
    assert.equal(course.lessons.filter((l) => l.preview).length, 1);
    assert(!JSON.stringify(publicData).includes("شرح محمي"));
    const profile = await guest.ok("/api/instructors/" + source.id);
    assert.equal(profile.videoCount, 3);
    assert(profile.videoSeconds >= 3);
    assert.equal(profile.courses[0].lessons.length, 3);
    for (const id of assets)
      assert.equal((await guest.req("/api/media/" + id)).status, 401);
    app.store.db
      .prepare("UPDATE assets SET public=1 WHERE id=?")
      .run(assets[1]);
    assert.equal(
      (await guest.req("/api/media/" + assets[1])).status,
      401,
      "the image public flag never publishes a video",
    );
    const registered = await student.ok("/api/auth/register", "POST", {
      email: "store-student@example.test",
      name: "طالب المعاينة",
      password: "preview-password-123",
    });
    assert.equal(registered.entitled, false);
    let own = (await student.ok("/api/content")).courses.find(
      (c) => c.id === "store-course",
    );
    assert(own.lessons[0].videoAssetId);
    assert.equal(own.lessons[1].videoAssetId, "");
    assert(own.lessons[1].locked);
    const range = await student.req(
      "/api/media/" + assets[0],
      "GET",
      undefined,
      { Range: "bytes=0-31" },
    );
    assert.equal(range.status, 206);
    assert.equal(range.data.length, 32);
    assert(range.headers.get("content-range").startsWith("bytes 0-31/"));
    for (const id of assets.slice(1))
      assert.equal((await student.req("/api/media/" + id)).status, 403);
    content = await owner.ok("/api/admin/content");
    content.courses.find((c) => c.id === "store-course").previewLessonId =
      "clip-2";
    await owner.ok("/api/admin/content", "PUT", content);
    assert.equal((await student.req("/api/media/" + assets[0])).status, 403);
    assert.equal((await student.req("/api/media/" + assets[1])).status, 200);
    content = await owner.ok("/api/admin/content");
    content.courses.find((c) => c.id === "store-course").previewLessonId = null;
    await owner.ok("/api/admin/content", "PUT", content);
    for (const id of assets)
      assert.equal((await student.req("/api/media/" + id)).status, 403);
    content = await owner.ok("/api/admin/content");
    content.courses.find((c) => c.id === "store-course").previewLessonId =
      "missing";
    assert.equal(
      (await owner.req("/api/admin/content", "PUT", content)).status,
      400,
    );
    content.courses.find((c) => c.id === "store-course").previewLessonId =
      "clip-1";
    content.storefront = storeConfig(content);
    content.storefront.sections.find((s) => s.id === "catalog").title =
      "عنوان يحرره المالك";
    content.storefront.sections.find((s) => s.id === "features").order = 2;
    content.storefront.featuredCourseIds = ["store-course"];
    content.storefront.featuredInstructorIds = [source.id];
    content.storefront.supportEmail = "support@example.test";
    await owner.ok("/api/admin/content", "PUT", content);
    assert.equal(
      (await guest.ok("/api/content")).storefront.sections.find(
        (s) => s.id === "catalog",
      ).title,
      "عنوان يحرره المالك",
    );
    assert.equal((await student.req("/api/admin/content")).status, 403);
    assert.equal(
      (
        await student.req("/api/checkout", "POST", {
          planId: "year",
          consent: true,
        })
      ).status,
      503,
    );
    assert.equal(
      app.store.db.prepare("SELECT count(*) n FROM orders").get().n,
      0,
    );
    const sessions = new Map();
    let charged;
    globalThis.fetch = async (url, options) => {
      if (!String(url).startsWith("https://api.stripe.com/v1"))
        return nativeFetch(url, options);
      if (options?.method === "POST") {
        const form = new URLSearchParams(options.body);
        charged = Number(form.get("line_items[0][price_data][unit_amount]"));
        const id = "cs_fixture_" + sessions.size;
        const value = {
          id,
          client_reference_id: form.get("client_reference_id"),
          amount_total: charged,
          currency: "sar",
          payment_status: "paid",
          livemode: true,
        };
        sessions.set(id, value);
        return new Response(
          JSON.stringify({
            id,
            url: "https://checkout.stripe.com/c/pay/" + id,
          }),
          { status: 200 },
        );
      }
      const id = decodeURIComponent(String(url).split("/").at(-1));
      return new Response(JSON.stringify(sessions.get(id)), { status: 200 });
    };
    app.store.saveSetting(
      "payment",
      {
        ...app.store.setting("payment"),
        enabled: true,
        mode: "live",
        provider: "stripe",
      },
      {
        secretKey: "sk_live_fixture_not_real",
        webhookSecret: "webhook-fixture-secret",
      },
    );
    const checkout = await student.ok("/api/checkout", "POST", {
      planId: "year",
      consent: true,
      amount: 1,
    });
    assert.equal(charged, 9999);
    assert(checkout.url.startsWith("https://checkout.stripe.com/"));
    assert.equal((await student.ok("/api/session")).entitled, false);
    assert.equal(
      (await student.req("/#/payment/success?order=" + checkout.orderId))
        .status,
      200,
    );
    assert.equal(
      (await student.ok("/api/orders/" + checkout.orderId)).entitled,
      false,
    );
    const order = app.store.db
        .prepare("SELECT * FROM orders WHERE id=?")
        .get(checkout.orderId),
      event = {
        id: "evt_fixture_paid",
        type: "checkout.session.completed",
        data: { object: { id: order.provider_id, payment_status: "paid" } },
      };
    const postEvent = async (event, signature = true) => {
      const raw = Buffer.from(JSON.stringify(event)),
        ts = Math.floor(Date.now() / 1000),
        sig = createHmac("sha256", "webhook-fixture-secret")
          .update(ts + "." + raw)
          .digest("hex");
      return guest.req("/api/payments/webhook", "POST", raw, {
        "Content-Type": "application/json",
        "Stripe-Signature": signature ? `t=${ts},v1=${sig}` : "bad",
      });
    };
    assert.equal((await postEvent(event, false)).status, 400);
    assert.equal((await student.ok("/api/session")).entitled, false);
    assert.equal((await postEvent(event)).status, 200);
    const paid = await student.ok("/api/session");
    assert.equal(paid.entitled, true);
    const sub = paid.student.subscription;
    assert.equal(sub.plan_id, "year");
    assert.equal(sub.end_at, addMonths(sub.start_at, 12).toISOString());
    for (const id of assets)
      assert.equal((await student.req("/api/media/" + id)).status, 200);
    assert.equal(
      (await student.req("/api/media/" + assets[1])).headers.get(
        "cache-control",
      ),
      "private,no-store",
      "a legacy public flag must not cache protected video publicly",
    );
    app.store.db
      .prepare("UPDATE subscriptions SET end_at=? WHERE id=?")
      .run("2020-01-01T00:00:00.000Z", sub.id);
    assert.equal((await student.ok("/api/session")).entitled, false);
    assert.equal(
      (await student.req("/api/media/" + assets[1])).status,
      403,
      "expired subscriptions cannot access paid bytes",
    );
    assert.equal(
      (await student.req("/api/media/" + assets[0])).status,
      200,
      "the configured free preview remains available",
    );
    app.store.db
      .prepare("UPDATE subscriptions SET end_at=? WHERE id=?")
      .run(sub.end_at, sub.id);
    assert.equal((await postEvent(event)).status, 200);
    assert.equal(
      app.store.db
        .prepare("SELECT count(*) n FROM subscriptions WHERE user_id=?")
        .get(registered.user.id).n,
      1,
    );
    await failedStudent.ok("/api/auth/register", "POST", {
      email: "store-failure@example.test",
      name: "طالب دفع غير مكتمل",
      password: "failure-password-123",
    });
    const failed = await failedStudent.ok("/api/checkout", "POST", {
      planId: "quarter",
      consent: true,
    });
    const failedOrder = app.store.db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(failed.orderId);
    assert.equal(
      (
        await postEvent({
          id: "evt_fixture_failed",
          type: "checkout.session.async_payment_failed",
          data: { object: { id: failedOrder.provider_id } },
        })
      ).status,
      200,
    );
    assert.equal((await failedStudent.ok("/api/session")).entitled, false);
    assert.equal(
      (await failedStudent.req("/api/media/" + assets[1])).status,
      403,
    );
    const uiSettings = JSON.stringify(await guest.ok("/api/content"));
    assert(!uiSettings.includes("sk_live_"));
    assert(!uiSettings.includes("webhook-fixture-secret"));
  } finally {
    globalThis.fetch = nativeFetch;
    app.server.close();
    await once(app.server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

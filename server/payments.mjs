import { createHmac, randomUUID } from "node:crypto";
import { fail, equal } from "./security.mjs";
import { PLANS } from "./database.mjs";
export const providers = {
  stripe: { label: "Stripe Checkout", api: "https://api.stripe.com/v1" },
  external: { label: "رابط دفع خارجي — دون تفعيل تلقائي" },
};
async function stripeRequest(
  path,
  secret,
  { method = "GET", body, idempotency } = {},
) {
  if (!secret) fail(503, "لم يُضبط Secret Key لبوابة الدفع");
  let response;
  try {
    response = await fetch("https://api.stripe.com/v1" + path, {
      method,
      headers: {
        Authorization: "Bearer " + secret,
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(idempotency ? { "Idempotency-Key": idempotency } : {}),
      },
      body: body?.toString(),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    fail(502, "تعذر الوصول إلى بوابة الدفع. حاول لاحقًا.");
  }
  const data = await response.json();
  if (!response.ok)
    fail(502, "رفض مزود الدفع الطلب. تحقق من إعدادات البوابة وسجل المزود.");
  return data;
}
function secretFor(s) {
  return s.secrets.secretKey || process.env.STRIPE_SECRET_KEY;
}
export async function testPayment(store) {
  const s = store.setting("payment");
  if (s.provider === "external") {
    if (!/^https:\/\//.test(s.externalUrl)) fail(400, "أدخل رابط دفع HTTPS");
    return {
      verified: false,
      message:
        "وضع دفع خارجي. صلاحية الرابط لا تعني نجاح عملية دفع، ولا يفعّل اشتراكًا تلقائيًا.",
    };
  }
  const data = await stripeRequest("/balance", secretFor(s));
  if (Boolean(data.livemode) !== (s.mode === "live"))
    fail(400, "المفتاح لا يطابق وضع Test/Live المختار");
  return {
    verified: true,
    checkedAt: new Date().toISOString(),
    message: "استجاب Stripe لطلب اختبار مصادق عليه.",
  };
}
function returnUrl(store, path, order) {
  if (!/^\/#\/payment\/(success|failure)$/.test(path))
    fail(400, "رابط العودة يجب أن يكون صفحة رُزمة المحددة");
  return store.cfg.origin + path + "?order=" + encodeURIComponent(order);
}
export async function checkout(store, user, planId) {
  const p = PLANS.find((p) => p.id === planId);
  if (!p) fail(400, "مدة الاشتراك غير صالحة");
  const s = store.setting("payment");
  if (!s.enabled) fail(503, "الدفع غير مفعّل حاليًا");
  const id = randomUUID(),
    amount = Math.round(p.price * 100);
  store.db
    .prepare(
      "INSERT INTO orders(id,user_id,plan_id,amount,status,provider,mode,created_at) VALUES(?,?,?,?,?,?,?,?)",
    )
    .run(
      id,
      user.id,
      p.id,
      amount,
      "pending",
      s.provider,
      s.mode,
      new Date().toISOString(),
    );
  if (s.provider === "external") {
    if (!/^https:\/\//.test(s.externalUrl))
      fail(400, "رابط الدفع الخارجي غير مضبوط");
    store.audit(user.id, "payment.external", id);
    return {
      orderId: id,
      url: s.externalUrl,
      external: true,
      message:
        "دفع خارجي لا يفعّل الاشتراك تلقائيًا؛ يلزم تحقق إداري من بوابة الدفع.",
    };
  }
  if (s.provider !== "stripe") fail(400, "مزود الدفع غير مدعوم بعد");
  const secret = secretFor(s);
  if (
    !secret ||
    (s.mode === "test" && !secret.startsWith("sk_test_")) ||
    (s.mode === "live" && !secret.startsWith("sk_live_"))
  )
    fail(503, "مفتاح Stripe لا يطابق وضع التشغيل");
  const form = new URLSearchParams({
    mode: "payment",
    success_url: returnUrl(store, s.successPath, id),
    cancel_url: returnUrl(store, s.cancelPath, id),
    client_reference_id: id,
    customer_email: user.email,
    "metadata[order_id]": id,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "sar",
    "line_items[0][price_data][unit_amount]": String(amount),
    "line_items[0][price_data][product_data][name]": "رُزمة — " + p.title,
  });
  try {
    const result = await stripeRequest("/checkout/sessions", secret, {
      method: "POST",
      body: form,
      idempotency: id,
    });
    if (!result.id || !/^https:\/\/checkout\.stripe\.com\//.test(result.url))
      fail(502, "استجابة Checkout غير متوقعة");
    store.db
      .prepare("UPDATE orders SET provider_id=? WHERE id=?")
      .run(result.id, id);
    store.audit(user.id, "payment.checkout", id);
    return { orderId: id, url: result.url, external: false };
  } catch (err) {
    store.db.prepare("UPDATE orders SET status='failed' WHERE id=?").run(id);
    throw err;
  }
}
export function verifyStripeSignature(raw, header, secret, now = Date.now()) {
  if (!secret) fail(503, "Webhook Secret غير مضبوط");
  const parts = String(header || "")
      .split(",")
      .map((x) => x.split("=")),
    time = parts.find((x) => x[0] === "t")?.[1],
    signatures = parts.filter((x) => x[0] === "v1").map((x) => x[1]);
  if (!time || Math.abs(now / 1000 - Number(time)) > 300)
    fail(400, "توقيع webhook منتهي أو غير صالح");
  const sig = createHmac("sha256", secret)
    .update(time + ".")
    .update(raw)
    .digest("hex");
  if (!signatures.some((s) => equal(s, sig)))
    fail(400, "توقيع webhook غير صالح");
  try {
    return JSON.parse(raw);
  } catch {
    fail(400, "Webhook غير صالح");
  }
}
export function addMonths(date, months) {
  const value = new Date(date),
    day = value.getUTCDate();
  value.setUTCDate(1);
  value.setUTCMonth(value.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0),
  ).getUTCDate();
  value.setUTCDate(Math.min(day, last));
  return value;
}
export function activateOrder(store, orderId, eventId, session) {
  return store.transaction(() => {
    if (
      store.db.prepare("SELECT id FROM payment_events WHERE id=?").get(eventId)
    )
      return { duplicate: true };
    const order = store.db
      .prepare("SELECT * FROM orders WHERE id=?")
      .get(orderId);
    if (!order) fail(400, "طلب دفع غير موجود");
    if (
      order.provider !== "stripe" ||
      order.provider_id !== session.id ||
      session.client_reference_id !== order.id ||
      session.amount_total !== order.amount ||
      session.currency !== "sar" ||
      session.payment_status !== "paid" ||
      Boolean(session.livemode) !== (order.mode === "live")
    )
      fail(400, "بيانات الدفع لا تطابق الطلب");
    store.db
      .prepare("INSERT INTO payment_events VALUES(?,?,?)")
      .run(eventId, orderId, new Date().toISOString());
    if (order.status === "paid") return { duplicate: true };
    // Test payments are recorded and never unlock production subscriptions.
    store.db
      .prepare("UPDATE orders SET status='paid',paid_at=? WHERE id=?")
      .run(new Date().toISOString(), orderId);
    if (order.mode === "live") {
      const plan = PLANS.find((p) => p.id === order.plan_id),
        now = new Date();
      const latest = store.db
        .prepare(
          "SELECT end_at FROM subscriptions WHERE user_id=? AND status='active' AND end_at>? ORDER BY end_at DESC LIMIT 1",
        )
        .get(order.user_id, now.toISOString());
      const end = addMonths(latest?.end_at || now, plan.months);
      store.db
        .prepare("INSERT INTO subscriptions VALUES(?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          order.user_id,
          plan.id,
          now.toISOString(),
          end.toISOString(),
          "active",
          order.id,
        );
    }
    store.audit(null, "payment.confirmed", order.id, { mode: order.mode });
    return { activated: order.mode === "live" };
  });
}
export async function handleStripeWebhook(store, raw, header) {
  const s = store.setting("payment");
  const event = verifyStripeSignature(
    raw,
    header,
    s.secrets.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET,
  );
  if (
    ![
      "checkout.session.completed",
      "checkout.session.async_payment_succeeded",
      "checkout.session.async_payment_failed",
      "checkout.session.expired",
    ].includes(event.type)
  )
    return { ignored: true };
  const obj = event.data?.object;
  if (!obj?.id) fail(400, "Webhook بلا جلسة");
  const order = store.db
    .prepare("SELECT * FROM orders WHERE provider_id=?")
    .get(obj.id);
  if (!order) fail(400, "جلسة دفع غير معروفة");
  if (
    [
      "checkout.session.expired",
      "checkout.session.async_payment_failed",
    ].includes(event.type)
  ) {
    store.db
      .prepare("UPDATE orders SET status=? WHERE id=? AND status<>'paid'")
      .run(event.type.endsWith("expired") ? "cancelled" : "failed", order.id);
    return { ok: true };
  }
  if (obj.payment_status !== "paid") return { pending: true };
  const verified = await stripeRequest(
    "/checkout/sessions/" + encodeURIComponent(obj.id),
    secretFor(s),
  );
  return activateOrder(store, order.id, event.id, verified);
}

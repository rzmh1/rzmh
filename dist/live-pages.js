import { authLink, safeNext } from "./course-policy.js";
import {
  db,
  student,
  escape as e,
  money,
  allFeatures,
  initialize,
} from "./data.js";
import { account, api } from "./api.js";
import { icon, btn, pageHeading, notice, empty } from "./ui.js";
export function authLive(signup = false) {
  const rawNext =
      typeof location === "undefined"
        ? null
        : new URLSearchParams(location.hash.split("?")[1] || "").get("next"),
    next = safeNext(rawNext)?.slice(1) || "/sections";
  return `<div class="auth-layout"><div class="auth-art">${icon("play")}<h2>تعرّف على الشرح.<br>قبل أن تختار.</h2><p>حساب مجاني لمعاينة المحتوى المتاح، ثم اشتراك شامل عندما تكون مستعدًا.</p><a class="text-link" href="#/sections">استعرض الدورات ${icon("arrow")}</a></div><div class="auth-form"><span class="eyebrow">${signup ? "حساب مجاني. بداية واضحة." : "أهلًا بعودتك إلى رُزمة"}</span><h1>${signup ? "خلّنا نبدأ." : "نكمل من مكانك."}</h1><p>${rawNext ? "بعد الدخول نعيدك إلى المحتوى الذي اخترته." : signup ? "أنشئ حسابك لاستكشاف المعاينات المتاحة." : "سجل الدخول لمتابعة استكشافك أو دراستك."}</p><form id="auth-form" data-signup="${signup}">${signup ? '<div class="field"><label for="display-name">اسم العرض</label><input id="display-name" name="name" maxlength="80" autocomplete="name" required></div>' : ""}<div class="field"><label for="auth-email">البريد الإلكتروني</label><input id="auth-email" name="email" type="email" dir="ltr" autocomplete="email" required maxlength="254"></div><div class="field"><label for="auth-password">كلمة المرور</label><input id="auth-password" name="password" type="password" ${signup ? 'minlength="8"' : ""} maxlength="200" autocomplete="${signup ? "new-password" : "current-password"}" required><small>${signup ? "٨ أحرف على الأقل. سنرسل رمز تحقق إلى بريدك تلقائيًا بعد المتابعة." : "أدخل كلمة المرور المرتبطة بحسابك."}</small></div><div id="form-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">${signup ? "إنشاء حساب مجاني" : "تسجيل الدخول"} ${icon("arrow")}</button></form>${signup ? "" : `<p class="smalltext spaced"><a class="text-link" href="#/forgot-password">نسيت كلمة المرور؟</a> · <a class="text-link" href="#/verify-email">إعادة إرسال رمز التحقق</a></p>`}<div class="auth-switch">${signup ? "لديك حساب؟" : "أول مرة هنا؟"} <a href="${authLink(!signup, next)}">${signup ? "تسجيل الدخول" : "إنشاء حساب مجاني"}</a></div></div></div>`;
}
export function adminAuthLive() {
  return `<div class="auth-layout"><div class="auth-art">${icon("shield-check")}<h2>مساحة إدارة رُزمة.</h2><p>هذه الصفحة مخصصة لمالك المنصة فقط. حسابات الطلاب لا تملك صلاحية الدخول إلى الإدارة.</p><a class="text-link" href="#/login">العودة إلى دخول الطلاب ${icon("arrow")}</a></div><div class="auth-form"><span class="eyebrow">دخول المالك</span><h1>إدارة رُزمة.</h1><p>استخدم البريد وكلمة المرور اللذين تم إعداد حساب المالك بهما.</p><form id="admin-auth-form"><div class="field"><label for="admin-auth-email">بريد المالك</label><input id="admin-auth-email" name="email" type="email" dir="ltr" autocomplete="username" maxlength="254" required></div><div class="field"><label for="admin-auth-password">كلمة المرور</label><input id="admin-auth-password" name="password" type="password" autocomplete="current-password" maxlength="200" required></div><div id="admin-form-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">${icon("lock")} دخول لوحة الإدارة</button></form><div class="auth-switch"><a href="#/login">تسجيل دخول الطالب</a></div></div></div>`;
}
export function verifyEmailLive() {
  const params = new URLSearchParams(location.hash.split("?")[1] || ""),
    mail = params.get("email") || "";
  return `<div class="auth-layout"><div class="auth-art">${icon("mail")}<h2>بريدك هو مفتاح حسابك.</h2><p>نرسل رمزًا قصير الصلاحية للتأكد من أنك تملك البريد المسجل.</p></div><div class="auth-form"><span class="eyebrow">خطوة أمان إضافية</span><h1>تحقق من بريدك.</h1><p>أدخل الرمز المكوّن من ٦ أرقام الذي أرسلناه إلى بريدك. تنتهي صلاحيته خلال ١٠ دقائق.</p><form id="verify-email-form"><div class="field"><label for="verify-email">البريد الإلكتروني</label><input id="verify-email" name="email" type="email" dir="ltr" maxlength="254" value="${e(mail)}" required></div><div class="field"><label for="verify-code">رمز التحقق</label><input id="verify-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" minlength="6" dir="ltr" required></div><div id="verify-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">تأكيد البريد والمتابعة ${icon("arrow")}</button></form><form id="verify-resend-form" class="spaced"><input type="hidden" name="email" value="${e(mail)}"><button class="btn btn-outline" type="submit">إعادة إرسال الرمز</button><p id="verify-resend-status" class="smalltext" aria-live="polite"></p></form><div class="auth-switch"><a href="#/login">العودة لتسجيل الدخول</a></div></div></div>`;
}
export function forgotPasswordLive() {
  return `<div class="auth-layout"><div class="auth-art">${icon("lock")}<h2>نساعدك ترجع لحسابك.</h2><p>نرسل رمز استعادة إلى البريد المؤكد المرتبط بالحساب.</p></div><div class="auth-form"><span class="eyebrow">استعادة الحساب</span><h1>نسيت كلمة المرور؟</h1><p>أدخل بريدك الإلكتروني، وسنرسل رمزًا إذا كان الحساب مسجلًا ومؤكدًا.</p><form id="forgot-password-form"><div class="field"><label for="forgot-email">البريد الإلكتروني</label><input id="forgot-email" name="email" type="email" dir="ltr" autocomplete="email" maxlength="254" required></div><div id="forgot-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">إرسال رمز الاستعادة ${icon("arrow")}</button></form><div class="auth-switch"><a href="#/login">العودة لتسجيل الدخول</a></div></div></div>`;
}
export function resetPasswordLive() {
  const mail = new URLSearchParams(location.hash.split("?")[1] || "").get("email") || "";
  return `<div class="auth-layout"><div class="auth-art">${icon("shield-check")}<h2>حسابك يبقى لك.</h2><p>رمز واحد، صالح لعشر دقائق، ويُستخدم مرة واحدة.</p></div><div class="auth-form"><span class="eyebrow">تعيين كلمة مرور جديدة</span><h1>استعد حسابك.</h1><p>أدخل رمز البريد وكلمة مرور جديدة لا تقل عن ٨ أحرف.</p><form id="reset-password-form"><div class="field"><label for="reset-email">البريد الإلكتروني</label><input id="reset-email" name="email" type="email" dir="ltr" maxlength="254" value="${e(mail)}" required></div><div class="field"><label for="reset-code">رمز الاستعادة</label><input id="reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" dir="ltr" required></div><div class="field"><label for="reset-password">كلمة المرور الجديدة</label><input id="reset-password" name="password" type="password" minlength="8" maxlength="200" autocomplete="new-password" required></div><div id="reset-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">حفظ كلمة المرور ${icon("check")}</button></form><div class="auth-switch"><a href="#/forgot-password">طلب رمز جديد</a> · <a href="#/login">تسجيل الدخول</a></div></div></div>`;
}
export function reviewOrder(id) {
  const p = db.plans.find((p) => p.id === id);
  if (!p)
    return `${pageHeading("رُزمة معك", "اشتراكك، بكل وضوح.")}<div class="panel"><h2>${student.subscription ? "اشتراكك نشط" : "لم يبدأ اشتراكك بعد"}</h2>${student.subscription ? `<p>الباقة: ${e(db.plans.find((p) => p.id === student.subscription.plan_id)?.title || "شاملة")}<br>من ${new Date(student.subscription.start_at).toLocaleDateString("ar-SA")} إلى ${new Date(student.subscription.end_at).toLocaleDateString("ar-SA")}</p>` : "<p>اختر المدة التي تناسب خطتك. كل المسارات ضمن اشتراك واحد.</p>"}<div class="spaced">${btn("استكشف الاشتراك", "#/pricing")}</div></div>`;
  const enabled = db.services?.payment,
    mode = db.services?.paymentMode,
    external = db.services?.paymentProvider === "external";
  return `${pageHeading("مراجعة الطلب", "كل استعدادك. في اشتراك واحد.", "راجع المدة والمبلغ قبل الانتقال إلى بوابة الدفع الآمنة.")}<div class="subscription-layout"><div class="panel"><span class="eyebrow">كل المسارات، نفس المميزات</span><h2>من التأسيس إلى الاختبار.</h2><div class="stack spaced">${allFeatures.map((f) => `<span>${icon("check")} ${f}</span>`).join("")}</div></div><div class="panel order-review"><span class="badge badge-purple">رُزمة الشاملة</span><h2 class="spaced">${e(p.title)}</h2><p>دفعة واحدة لكامل المدة · بلا تجديد تلقائي</p><div class="order-total"><span>الإجمالي<br><small>ريال سعودي</small></span><b>${money(p.price)}</b></div>${notice("لن يفعّل الاشتراك إلا بعد التحقق من نجاح الدفع على الخادم. لا تدخل بيانات بطاقتك داخل رُزمة.", "lock")}${!enabled ? notice("الدفع غير متاح حاليًا. لن يُنشأ طلب أو يُفعّل اشتراك قبل إعداد بوابة الدفع.") : mode === "test" ? notice("بوابة الدفع في وضع الاختبار. العملية الاختبارية لا تمنح اشتراكًا فعليًا.") : external ? notice("دفع خارجي يحتاج تحققًا إداريًا؛ فتح الرابط لا يؤكد الاشتراك.") : ""}${!account.user ? `<p class="spaced"><a class="text-link" href="${authLink(false, "/subscription/" + p.id)}">سجّل الدخول</a> أو <a class="text-link" href="${authLink(true, "/subscription/" + p.id)}">أنشئ حسابًا مجانيًا</a> لإكمال اشتراكك.</p>` : ""}<form id="subscription-form" data-plan="${p.id}"><label class="checkbox"><input type="checkbox" required><span>راجعت المدة والمبلغ، وأوافق على الدفع مرة واحدة لهذه المدة.</span></label><div id="checkout-error" role="alert" class="form-error"></div><button class="btn btn-primary spaced" type="submit" ${!enabled ? "disabled" : ""}>${mode === "test" ? "الانتقال للدفع الاختباري" : "انتقل للدفع الآمن"} ${icon("lock")}</button></form><div id="external-payment-note"></div></div></div>`;
}
export function paymentStatus(success) {
  return `${pageHeading("حالة طلبك", success ? "نتحقق من خطوتك الأخيرة." : "لم تكتمل عملية الدفع.", success ? "العودة من بوابة الدفع لا تعني تأكيد العملية. تعرض هذه الصفحة الحالة المسجلة على الخادم." : "يمكنك مراجعة طلبك والمحاولة مجددًا. لن يُفعّل اشتراك غير مؤكد.")}<div class="panel center" id="payment-status">${icon("clock")}<p>جارٍ التحقق من سجل الطلب…</p></div><div class="spaced center">${btn("إلى اشتراكي", "#/subscription", "outline")} ${btn("العودة للباقات", "#/pricing")}</div>`;
}
export async function loadPaymentStatus(toast) {
  const query = location.hash.split("?")[1] || "";
  const id = new URLSearchParams(query).get("order");
  const target = document.querySelector("#payment-status");
  if (!id) {
    target.innerHTML =
      "<h2>لا يوجد طلب مرتبط بهذه الصفحة.</h2><p>لا يتم تفعيل أي اشتراك بزيارة رابط النجاح.</p>";
    return () => {};
  }
  let stopped = false,
    redirectTimer = null;
  async function check() {
    try {
      const { order, entitled } = await api(
        "/api/orders/" + encodeURIComponent(id),
      );
      if (stopped || !target.isConnected) return;
      const paid = order.status === "paid";
      target.innerHTML = `<h2>${paid ? (order.mode === "test" ? "تم تأكيد دفع اختباري." : "تم تأكيد الدفع. أهلًا بك في رُزمة!") : order.status === "pending" ? "بانتظار تأكيد بوابة الدفع." : "العملية " + (order.status === "cancelled" ? "ملغاة" : "لم تنجح")}</h2><p>رقم الطلب: ${e(order.id)}<br>المبلغ: ${money(order.amount / 100)} ريال</p>${order.mode === "test" ? notice("عملية Test Mode لا تمنح اشتراكًا فعليًا.") : ""}${!paid ? "<p>قد يتأخر Webhook قليلًا. يمكنك العودة لهذه الصفحة لاحقًا.</p>" : ""}`;
      if (paid && order.mode === "live" && entitled) {
        await initialize();
        if (stopped || !target.isConnected) return;
        const next = account.learning?.profile?.onboardingCompleted
          ? "#/dashboard"
          : "#/welcome";
        target.innerHTML += `<div class="spaced">${btn("إلى منصة الطالب", next)}</div><p>اشتراكك مفعّل. ننقلك الآن إلى رحلتك.</p>`;
        redirectTimer = setTimeout(() => {
          if (!stopped && target.isConnected) location.hash = next;
        }, 1800);
      }
      if (!paid && order.status === "pending") setTimeout(check, 5000);
    } catch (err) {
      if (target.isConnected) target.textContent = err.message;
    }
  }
  await check();
  return () => {
    stopped = true;
    clearTimeout(redirectTimer);
  };
}
export function tutorLive() {
  return `<div class="ai-full">${pageHeading("مدرّسك في رُزمة", "اسأل عن سؤال. وشاهد الحل خطوة بخطوة.", "اكتب سؤالك أو أرفق صورة سؤال أو ملف PDF.")}<div class="notice">${icon("spark")}<p>يركّز المدرس على أسئلة القدرات والتحصيلي وSTEP ومصادر رُزمة. يشرح السؤال على لوحة الحل دون تشغيل شرح محاضرة كاملة.</p></div><div class="tutor-layout"><div class="panel"><div class="admin-bar"><h2>محادثاتك</h2><button class="btn btn-outline btn-sm" data-ai-new>محادثة جديدة ${icon("plus")}</button></div><div id="conversation-list"></div></div><div class="panel"><div id="ai-chat" class="ai-chat" aria-live="polite"><div class="chat-welcome">${icon("spark")}<h3>ما السؤال الذي تريد فهمه؟</h3><p>اكتب السؤال أو أرفق صورته، ويمكنك الرسم في مساحة الحل.</p></div></div><form id="tutor-form"><label for="tutor-input">سؤالك أو موضع استفسارك</label><textarea id="tutor-input" name="message" maxlength="1200" placeholder="اكتب السؤال أو اشرح الجزء الذي لم تفهمه…"></textarea><div class="tutor-attachment"><label for="tutor-attachment" class="btn btn-outline btn-sm">${icon("image")} إرفاق صورة أو PDF</label><input id="tutor-attachment" name="attachment" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" hidden><small id="tutor-file-name" class="muted">صورة حتى ٤ ميجابايت · PDF حتى ٥ ميجابايت</small></div><section class="tutor-draw-panel"><div class="admin-bar"><div><h3>مساحة رسم الطالب</h3><small class="muted">اكتب خطواتك أو ارسم الجزء الذي تريد شرحه.</small></div><div class="tutor-draw-actions"><input id="tutor-pen-color" type="color" value="#594775" aria-label="لون القلم"><input id="tutor-pen-size" type="range" min="2" max="12" value="4" aria-label="سمك القلم"><button type="button" class="btn btn-outline btn-sm" data-tutor-draw="pen">قلم</button><button type="button" class="btn btn-outline btn-sm" data-tutor-draw="marker">تمييز</button><button type="button" class="btn btn-outline btn-sm" data-tutor-draw="undo">تراجع</button><button type="button" class="btn btn-outline btn-sm" data-tutor-draw="clear">مسح</button></div></div><canvas id="tutor-drawing-canvas" width="900" height="340" aria-label="مساحة رسم السؤال"></canvas><small class="muted">الرسم لا يُرسل إلا عند الضغط على «اسأل المدرس».</small></section><div class="admin-bar spaced"><small id="ai-quota" class="muted">يُتحقق من صلاحية الاشتراك والحد اليومي على الخادم.</small><button class="btn btn-primary" type="submit">اسأل المدرس ${icon("arrow")}</button></div><p id="ai-error" class="form-error" role="alert"></p></form></div></div></div>`;
}
export function teacherBoardMarkup(text) {
  const raw = String(text || "");
  const match = raw.match(/```diagram\s*([\s\S]*?)```/i);
  let diagram = null;
  if (match) {
    try {
      const value = JSON.parse(match[1]);
      if (value && Array.isArray(value.shapes)) {
        diagram = {
          shapes: value.shapes.slice(0, 50).filter((shape) =>
            shape && ["line", "arrow", "circle", "rect", "point", "text", "polyline", "polygon", "axes"].includes(shape.type)
          ),
        };
      }
    } catch {}
  }
  const clean = raw.replace(/```diagram\s*[\s\S]*?```/gi, "").trim();
  const lines = clean.split(/\n+/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)、])\s*/, "").trim())
    .filter(Boolean).slice(0, 30);
  const steps = lines.length ? lines : [clean || "اتبع الرسم التوضيحي ثم راجع خطوات الحل."];
  const canvas = diagram?.shapes.length
    ? `<canvas class="tutor-teacher-canvas" width="1000" height="600" data-teacher-diagram="${e(JSON.stringify(diagram))}" aria-label="رسم توضيحي من مدرس رُزمة"></canvas>`
    : "";
  return `<section class="tutor-solution-board" dir="rtl"><div class="tutor-board-heading"><span>${icon("presentation")} سبورة مدرس رُزمة</span><small>${steps.length} خطوات</small></div>${canvas}<div class="tutor-board-steps">${steps.map((line, index) => `<div class="tutor-board-step" data-board-step="${index}" ${index ? "hidden" : ""}><b>${index + 1}</b><p dir="auto">${e(line)}</p></div>`).join("")}</div><div class="tutor-board-controls"><button type="button" class="btn btn-outline btn-sm" data-board-next ${steps.length <= 1 ? "hidden" : ""}>الخطوة التالية</button><button type="button" class="btn btn-ghost btn-sm" data-board-all ${steps.length <= 1 ? "hidden" : ""}>عرض كل الحل</button></div></section>`;
}
export function mountTutor(toast) {
  let conversationId = null,
    disposed = false;
  const list = document.querySelector("#conversation-list"),
    chat = document.querySelector("#ai-chat"),
    canvas = document.querySelector("#tutor-drawing-canvas"),
    penColor = document.querySelector("#tutor-pen-color"),
    penSize = document.querySelector("#tutor-pen-size");
  let strokes = [], activeStroke = null, hasDrawing = false, baseImage = null, imageLoading = Promise.resolve(), drawTool = "pen";
  const ctx = canvas?.getContext("2d");
  const renderMessage = (item) => message(item.role, item.content) + (item.role === "assistant" ? teacherBoardMarkup(item.content) : "");
  const drawTeacherDiagrams = (root = chat) => {
    for (const board of root.querySelectorAll("canvas[data-teacher-diagram]")) {
      let diagram;
      try { diagram = JSON.parse(board.dataset.teacherDiagram); } catch { continue; }
      const ctx = board.getContext("2d");
      if (!ctx || !Array.isArray(diagram?.shapes)) continue;
      const dpr = window.devicePixelRatio || 1, rect = board.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.max(1, Math.round(rect.width * 0.6 * dpr));
      if (board.width !== width || board.height !== height) { board.width = width; board.height = height; }
      ctx.setTransform(dpr * rect.width / 1000, 0, 0, dpr * rect.width / 1000, 0, 0);
      ctx.clearRect(0, 0, 1000, 600);
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1000, 600);
      const coord = (v, fallback = 0) => Number.isFinite(Number(v)) ? Math.max(0, Math.min(1000, Number(v))) : fallback;
      const color = (v) => /^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : "#594775";
      const line = (shape, arrow = false) => {
        const x1 = coord(shape.x1), y1 = coord(shape.y1), x2 = coord(shape.x2), y2 = coord(shape.y2);
        ctx.strokeStyle = color(shape.color); ctx.lineWidth = Math.max(1, Math.min(12, Number(shape.width) || 4));
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (arrow) {
          const angle = Math.atan2(y2 - y1, x2 - x1), size = 18;
          ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x2 - size * Math.cos(angle - Math.PI / 6), y2 - size * Math.sin(angle - Math.PI / 6)); ctx.lineTo(x2 - size * Math.cos(angle + Math.PI / 6), y2 - size * Math.sin(angle + Math.PI / 6)); ctx.closePath(); ctx.fillStyle = color(shape.color); ctx.fill();
        }
      };
      for (const shape of diagram.shapes.slice(0, 50)) {
        if (!shape || typeof shape !== "object") continue;
        ctx.strokeStyle = color(shape.color); ctx.fillStyle = color(shape.color); ctx.lineWidth = Math.max(1, Math.min(12, Number(shape.width) || 4));
        const x = coord(shape.x), y = coord(shape.y);
        if (shape.type === "line" || shape.type === "arrow") line(shape, shape.type === "arrow");
        else if (shape.type === "circle") { ctx.beginPath(); ctx.arc(x, y, Math.max(2, Math.min(250, Number(shape.r) || 24)), 0, Math.PI * 2); ctx.stroke(); }
        else if (shape.type === "rect") ctx.strokeRect(x, y, Math.max(1, Math.min(1000, Number(shape.w) || 80)), Math.max(1, Math.min(600, Number(shape.h) || 60)));
        else if (shape.type === "point") { ctx.beginPath(); ctx.arc(x, y, Math.max(3, Math.min(20, Number(shape.r) || 7)), 0, Math.PI * 2); ctx.fill(); if (shape.label) { ctx.font = "bold 25px sans-serif"; ctx.fillText(String(shape.label).slice(0, 35), x + 14, y - 12); } }
        else if (shape.type === "text") { ctx.font = ` ${Math.max(14, Math.min(42, Number(shape.size) || 24))}px sans-serif`; ctx.fillText(String(shape.text || "").slice(0, 90), x, y); }
        else if (shape.type === "polyline" || shape.type === "polygon") {
          if (!Array.isArray(shape.points) || shape.points.length < (shape.type === "polygon" ? 3 : 2)) continue;
          ctx.beginPath(); shape.points.slice(0, 100).forEach((p, i) => i ? ctx.lineTo(coord(p?.[0]), coord(p?.[1])) : ctx.moveTo(coord(p?.[0]), coord(p?.[1])));
          if (shape.type === "polygon") ctx.closePath(); ctx.stroke();
        } else if (shape.type === "axes") {
          const ox = coord(shape.x, 500), oy = coord(shape.y, 300);
          line({ x1: 70, y1: oy, x2: 940, y2: oy, color: shape.color, width: 3 }, true);
          line({ x1: ox, y1: 540, x2: ox, y2: 45, color: shape.color, width: 3 }, true);
          ctx.font = "bold 24px sans-serif"; ctx.fillText(String(shape.xLabel || "س").slice(0, 10), 920, oy - 14); ctx.fillText(String(shape.yLabel || "ص").slice(0, 10), ox + 12, 45);
        }
      }
    }
  };
  const paintDrawing = () => {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr)), height = Math.round(220 * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, rect.width, 220); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (baseImage) { const scale = Math.min(rect.width / baseImage.width, 220 / baseImage.height); const w = baseImage.width * scale, h = baseImage.height * scale; ctx.drawImage(baseImage, (rect.width - w) / 2, (220 - h) / 2, w, h); }
    for (const stroke of strokes) { ctx.save(); ctx.strokeStyle = stroke.color; ctx.lineWidth = stroke.tool === "marker" ? stroke.size * 3 : stroke.size; if (stroke.tool === "marker") ctx.globalAlpha = 0.28; ctx.beginPath(); stroke.points.forEach((p, i) => i ? ctx.lineTo(p.x * rect.width, p.y * 220) : ctx.moveTo(p.x * rect.width, p.y * 220)); if (stroke.points.length === 1) { const p = stroke.points[0]; ctx.beginPath(); ctx.arc(p.x * rect.width, p.y * 220, stroke.size / 2, 0, Math.PI * 2); ctx.fillStyle = stroke.color; ctx.fill(); } else ctx.stroke(); ctx.restore(); }
  };
  const drawingPoint = (event) => { const rect = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / 220)) }; };
  const pointerDown = (event) => { if (event.button !== 0 || !canvas) return; event.preventDefault(); activeStroke = { color: penColor?.value || "#594775", size: Number(penSize?.value || 4), tool: drawTool, points: [drawingPoint(event)] }; strokes.push(activeStroke); hasDrawing = true; canvas.setPointerCapture(event.pointerId); paintDrawing(); };
  const pointerMove = (event) => { if (!activeStroke || !canvas) return; for (const point of event.getCoalescedEvents?.() || [event]) activeStroke.points.push(drawingPoint(point)); paintDrawing(); };
  const pointerEnd = () => { activeStroke = null; };
  canvas?.addEventListener("pointerdown", pointerDown); canvas?.addEventListener("pointermove", pointerMove); canvas?.addEventListener("pointerup", pointerEnd); canvas?.addEventListener("pointercancel", pointerEnd);
  const resizeObserver = canvas ? new ResizeObserver(paintDrawing) : null; resizeObserver?.observe(canvas); paintDrawing();
  const message = (role, text) =>
    `<div class="live-message ${role}"><b>${role === "user" ? "أنت" : "مدرّس رُزمة"}</b><p>${e(String(text || "").replace(/```diagram[\s\S]*?```/gi, "").trim()).replace(/\n/g, "<br>")}</p></div>`;
  async function load() {
    try {
      const conversations = await api("/api/conversations");
      if (!disposed)
        list.innerHTML =
          conversations
            .map(
              (c) =>
                `<button class="conversation-btn" data-conversation="${e(c.id)}">${new Date(c.created_at).toLocaleString("ar-SA")}</button>`,
            )
            .join("") || "<p>ستظهر محادثاتك هنا.</p>";
    } catch (err) {
      toast(err.message);
    }
  }
  void load();
  const click = async (ev) => {
    const drawAction = ev.target.closest("[data-tutor-draw]")?.dataset.tutorDraw;
    if (drawAction === "pen" || drawAction === "marker") { drawTool = drawAction; document.querySelectorAll("[data-tutor-draw=pen], [data-tutor-draw=marker]").forEach((button) => button.classList.toggle("active", button.dataset.tutorDraw === drawTool)); }
    if (drawAction === "undo") { strokes.pop(); hasDrawing = strokes.length > 0 || !!baseImage; paintDrawing(); }
    if (drawAction === "clear") { strokes = []; hasDrawing = !!baseImage; paintDrawing(); }
    const next = ev.target.closest("[data-board-next]");
    if (next) { const board = next.closest(".tutor-solution-board"); const hidden = board.querySelector("[data-board-step][hidden]"); if (hidden) hidden.hidden = false; if (!board.querySelector("[data-board-step][hidden]")) next.hidden = true; }
    const all = ev.target.closest("[data-board-all]");
    if (all) { const board = all.closest(".tutor-solution-board"); board.querySelectorAll("[data-board-step]").forEach((step) => step.hidden = false); board.querySelector("[data-board-next]")?.setAttribute("hidden", ""); all.hidden = true; }
    const c = ev.target.closest("[data-conversation]");
    if (c) {
      try {
        const messages = await api(
          "/api/conversations/" + c.dataset.conversation,
        );
        if (disposed) return;
        conversationId = c.dataset.conversation;
        chat.innerHTML = messages.map(renderMessage).join("");
        drawTeacherDiagrams(chat);
      } catch (err) {
        toast(err.message);
      }
    }
    if (ev.target.closest("[data-ai-new]")) {
      conversationId = null;
      chat.innerHTML = "<p>محادثة جديدة. اكتب سؤالك أدناه.</p>";
      strokes = []; baseImage = null; hasDrawing = false; imageInputReset(); paintDrawing();
    }
  };
  const submit = async (ev) => {
    if (ev.target.id !== "tutor-form") return;
    ev.preventDefault();
    const form = ev.target,
      button = form.querySelector("button[type=submit]"),
      text = form.message.value.trim(),
      file = form.attachment.files?.[0] || null;
    if (!text && !file && !hasDrawing) return;
    button.disabled = true;
    const error = document.querySelector("#ai-error");
    error.textContent = "";
    try {
      let image = null, pdf = null;
      await imageLoading;
      if (file?.type === "application/pdf") {
        if (strokes.length) throw Error("إذا أردت الرسم على السؤال، أرفق صورة الصفحة بدل PDF حتى نرسل الرسم مع السؤال.");
        if (file.size > 5 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) throw Error("ارفع ملف PDF صالحًا لا يتجاوز ٥ ميجابايت.");
        const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); const comma = value.indexOf(","); if (comma < 0) reject(Error("تعذرت قراءة الملف.")); else resolve(value.slice(comma + 1)); }; reader.onerror = () => reject(Error("تعذرت قراءة الملف.")); reader.readAsDataURL(file); });
        pdf = { name: file.name, mimeType: file.type, data };
      } else if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw Error("أرفق صورة JPG أو PNG أو WebP أو ملف PDF.");
        if (file.size > 4 * 1024 * 1024) throw Error("حجم صورة السؤال يجب ألا يتجاوز ٤ ميجابايت.");
        if (baseImage && hasDrawing && canvas) image = { name: file.name, mimeType: "image/png", data: canvas.toDataURL("image/png").split(",")[1] };
        else {
          const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => { const value = String(reader.result || ""); const comma = value.indexOf(","); if (comma < 0) reject(Error("تعذرت قراءة الصورة.")); else resolve(value.slice(comma + 1)); }; reader.onerror = () => reject(Error("تعذرت قراءة الصورة.")); reader.readAsDataURL(file); });
          image = { name: file.name, mimeType: file.type, data };
        }
      } else if (hasDrawing && canvas) image = { name: "student-question-drawing.png", mimeType: "image/png", data: canvas.toDataURL("image/png").split(",")[1] };
      const shownText = text || (pdf ? "حلّل ملف PDF التعليمي المرفق واشرح السؤال أو الصفحة المطلوبة." : image ? "حلّل صورة السؤال أو الرسم المرفق واشرحه." : "");      const shownText = text || (image ? "حلّل صورة السؤال أو الرسم المرفق واشرحه." : "");
      chat.innerHTML += message("user", shownText + (file ? "\n[مرفق صورة: " + file.name + "]" : hasDrawing ? "\n[رسم الطالب مرفق]" : ""));
      const value = await api("/api/tutor", {
        method: "POST",
        body: { message: text, image, file: pdf, conversationId },
      });
      if (disposed) return;
      conversationId = value.conversationId;
      chat.innerHTML += message("assistant", value.text) + teacherBoardMarkup(value.text);
      drawTeacherDiagrams(chat);
      strokes = []; baseImage = null; hasDrawing = false; imageInputReset(); paintDrawing();
      form.message.value = "";
      form.attachment.value = "";
      document.querySelector("#tutor-file-name").textContent = "صورة حتى ٤ ميجابايت · PDF حتى ٥ ميجابايت";
      document.querySelector("#ai-quota").textContent =
        `المتبقي اليوم: ${value.remaining} طلبات`;
      await load();
    } catch (err) {
      if (!disposed) error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
  const imageInput = document.querySelector("#tutor-attachment");
  const imageInputReset = () => { if (imageInput) imageInput.value = ""; };
  const imageChange = () => {
    const file = imageInput?.files?.[0];
    const label = document.querySelector("#tutor-file-name");
    if (!file) { baseImage = null; hasDrawing = strokes.length > 0; paintDrawing(); if (label) label.textContent = "صورة JPG أو PNG أو WebP حتى ٤ ميجابايت"; return; }
    if (file.type !== "application/pdf" && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 4 * 1024 * 1024)) {
      imageInputReset();
      if (label) label.textContent = "اختر صورة JPG أو PNG أو WebP لا تتجاوز ٤ ميجابايت.";
      return;
    }
    if (label) label.textContent = file.name + " · " + Math.ceil(file.size / 1024) + " KB";
    if (file.type === "application/pdf") { baseImage = null; hasDrawing = strokes.length > 0; imageLoading = Promise.resolve(); paintDrawing(); return; }
    imageLoading = new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const image = new Image();
        image.onload = () => { baseImage = image; hasDrawing = true; paintDrawing(); resolve(); };
        image.onerror = () => reject(Error("تعذرت قراءة الصورة."));
        image.src = String(reader.result || "");
      };
      reader.onerror = () => reject(Error("تعذرت قراءة الصورة."));
      reader.readAsDataURL(file);
    });
    imageLoading.catch((err) => { if (!disposed) toast(err.message); });
  };
  imageInput?.addEventListener("change", imageChange);
  document.addEventListener("click", click);
  document.addEventListener("submit", submit);
  return () => {
    disposed = true;
    resizeObserver?.disconnect();
    canvas?.removeEventListener("pointerdown", pointerDown);
    canvas?.removeEventListener("pointermove", pointerMove);
    canvas?.removeEventListener("pointerup", pointerEnd);
    canvas?.removeEventListener("pointercancel", pointerEnd);
    imageInput?.removeEventListener("change", imageChange);
    document.removeEventListener("click", click);
    document.removeEventListener("submit", submit);
  };
}

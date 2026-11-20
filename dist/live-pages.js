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
  return `<div class="auth-layout"><div class="auth-art">${icon("play")}<h2>تعرّف على الشرح.<br>قبل أن تختار.</h2><p>حساب مجاني لمعاينة المحتوى المتاح، ثم اشتراك شامل عندما تكون مستعدًا.</p><a class="text-link" href="#/sections">استعرض الدورات ${icon("arrow")}</a></div><div class="auth-form"><span class="eyebrow">${signup ? "حساب مجاني. بداية واضحة." : "أهلًا بعودتك إلى رُزمة"}</span><h1>${signup ? "خلّنا نبدأ." : "نكمل من مكانك."}</h1><p>${rawNext ? "بعد الدخول نعيدك إلى المحتوى الذي اخترته." : signup ? "أنشئ حسابك لاستكشاف المعاينات المتاحة." : "سجل الدخول لمتابعة استكشافك أو دراستك."}</p><form id="auth-form" data-signup="${signup}">${signup ? '<div class="field"><label for="display-name">اسم العرض</label><input id="display-name" name="name" maxlength="80" autocomplete="name" required></div>' : ""}<div class="field"><label for="auth-email">البريد الإلكتروني</label><input id="auth-email" name="email" type="email" dir="ltr" autocomplete="email" required maxlength="254"></div><div class="field"><label for="auth-password">كلمة المرور</label><input id="auth-password" name="password" type="password" minlength="12" maxlength="200" autocomplete="${signup ? "new-password" : "current-password"}" required><small>${signup ? "١٢ حرفًا على الأقل. سنرسل رمز تحقق إلى بريدك تلقائيًا بعد المتابعة." : "١٢ حرفًا على الأقل."}</small></div><div id="form-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">${signup ? "إنشاء حساب مجاني" : "تسجيل الدخول"} ${icon("arrow")}</button></form>${signup ? "" : `<p class="smalltext spaced"><a class="text-link" href="#/forgot-password">نسيت كلمة المرور؟</a></p>`}<div class="auth-switch">${signup ? "لديك حساب؟" : "أول مرة هنا؟"} <a href="${authLink(!signup, next)}">${signup ? "تسجيل الدخول" : "إنشاء حساب مجاني"}</a></div></div></div>`;
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
  return `<div class="auth-layout"><div class="auth-art">${icon("shield-check")}<h2>حسابك يبقى لك.</h2><p>رمز واحد، صالح لعشر دقائق، ويُستخدم مرة واحدة.</p></div><div class="auth-form"><span class="eyebrow">تعيين كلمة مرور جديدة</span><h1>استعد حسابك.</h1><p>أدخل رمز البريد وكلمة مرور جديدة لا تقل عن ١٢ حرفًا.</p><form id="reset-password-form"><div class="field"><label for="reset-email">البريد الإلكتروني</label><input id="reset-email" name="email" type="email" dir="ltr" maxlength="254" value="${e(mail)}" required></div><div class="field"><label for="reset-code">رمز الاستعادة</label><input id="reset-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" minlength="6" maxlength="6" dir="ltr" required></div><div class="field"><label for="reset-password">كلمة المرور الجديدة</label><input id="reset-password" name="password" type="password" minlength="12" maxlength="200" autocomplete="new-password" required></div><div id="reset-error" class="form-error" role="alert"></div><button class="btn btn-primary" type="submit">حفظ كلمة المرور ${icon("check")}</button></form><div class="auth-switch"><a href="#/forgot-password">طلب رمز جديد</a> · <a href="#/login">تسجيل الدخول</a></div></div></div>`;
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
  return `<div class="ai-full">${pageHeading("مدرّسك في رُزمة", "نفهم الفكرة. ثم نبني عليها.", "اسأل عن مفهوم، ارفع مستوى تدريبك، أو رتّب خطتك. استجابات من OpenAI عبر الخادم.")}<div class="notice">${icon("spark")}<p>المدرس قد يخطئ. راجع الحل والمراجع المعتمدة. الحد الافتراضي ٧ طلبات يوميًا، ويمكن للمالك تعديله. لا ترسل بيانات شخصية حساسة. <a class="text-link" href="#/learning-settings">إعداد مشاركة خطتك ونتائجك مع المدرس</a></p></div><div class="tutor-layout"><div class="panel"><div class="admin-bar"><h2>محادثاتك</h2><button class="btn btn-outline btn-sm" data-ai-new>محادثة جديدة ${icon("plus")}</button></div><div id="conversation-list"></div></div><div class="panel"><div id="ai-chat" class="ai-chat" aria-live="polite"><div class="chat-welcome">${icon("spark")}<h3>بأي فكرة نبدأ اليوم؟</h3><p>جرّب: كيف أفهم النسب؟ أو كيف أراجع أخطائي قبل الاختبار؟</p></div></div><form id="tutor-form"><label for="tutor-input">سؤالك</label><textarea id="tutor-input" name="message" maxlength="4000" placeholder="اكتب سؤالك أو خطوات حلك… أو أرفق صورة سؤال"></textarea><div class="tutor-attachment"><label for="tutor-image" class="btn btn-outline btn-sm">${icon("image")} إرفاق صورة</label><input id="tutor-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" hidden><small id="tutor-file-name" class="muted">JPG أو PNG أو WebP · حتى ٤ ميجابايت</small></div><div class="admin-bar spaced"><small id="ai-quota" class="muted">يُتحقق من صلاحية الاشتراك والحد اليومي على الخادم.</small><button class="btn btn-primary" type="submit">اسأل المدرس ${icon("arrow")}</button></div><p id="ai-error" class="form-error" role="alert"></p></form></div></div></div>`;
}
export function mountTutor(toast) {
  let conversationId = null,
    disposed = false;
  const list = document.querySelector("#conversation-list"),
    chat = document.querySelector("#ai-chat");
  const message = (role, text) =>
    `<div class="live-message ${role}"><b>${role === "user" ? "أنت" : "مدرّس رُزمة"}</b><p>${e(text).replace(/\n/g, "<br>")}</p></div>`;
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
    const c = ev.target.closest("[data-conversation]");
    if (c) {
      try {
        const messages = await api(
          "/api/conversations/" + c.dataset.conversation,
        );
        if (disposed) return;
        conversationId = c.dataset.conversation;
        chat.innerHTML = messages
          .map((m) => message(m.role, m.content))
          .join("");
      } catch (err) {
        toast(err.message);
      }
    }
    if (ev.target.closest("[data-ai-new]")) {
      conversationId = null;
      chat.innerHTML = "<p>محادثة جديدة. اكتب سؤالك أدناه.</p>";
    }
  };
  const submit = async (ev) => {
    if (ev.target.id !== "tutor-form") return;
    ev.preventDefault();
    const form = ev.target,
      button = form.querySelector("button[type=submit]"),
      text = form.message.value.trim(),
      file = form.image.files?.[0] || null;
    if (!text && !file) return;
    button.disabled = true;
    const error = document.querySelector("#ai-error");
    error.textContent = "";
    try {
      let image = null;
      if (file) {
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
          throw Error("ارفع صورة JPG أو PNG أو WebP فقط.");
        if (file.size > 4 * 1024 * 1024)
          throw Error("حجم الصورة يجب ألا يتجاوز ٤ ميجابايت.");
        image = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const value = String(reader.result || "");
            const comma = value.indexOf(",");
            if (comma < 0) reject(Error("تعذرت قراءة الصورة."));
            else resolve({ name: file.name, mimeType: file.type, data: value.slice(comma + 1) });
          };
          reader.onerror = () => reject(Error("تعذرت قراءة الصورة."));
          reader.readAsDataURL(file);
        });
      }
      const shownText = text || "حلّل الصورة التعليمية المرفقة";
      chat.innerHTML += message("user", shownText + (file ? "\n[صورة مرفقة: " + file.name + "]" : ""));
      const value = await api("/api/tutor", {
        method: "POST",
        body: { message: text, image, conversationId },
      });
      if (disposed) return;
      conversationId = value.conversationId;
      chat.innerHTML += message("assistant", value.text);
      form.message.value = "";
      form.image.value = "";
      document.querySelector("#tutor-file-name").textContent = "JPG أو PNG أو WebP · حتى ٤ ميجابايت";
      document.querySelector("#ai-quota").textContent =
        `المتبقي اليوم: ${value.remaining} طلبات`;
      await load();
    } catch (err) {
      if (!disposed) error.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
  const imageInput = document.querySelector("#tutor-image");
  const imageChange = () => {
    const file = imageInput?.files?.[0];
    const label = document.querySelector("#tutor-file-name");
    if (label) label.textContent = file ? file.name + " · " + Math.ceil(file.size / 1024) + " KB" : "JPG أو PNG أو WebP · حتى ٤ ميجابايت";
  };
  imageInput?.addEventListener("change", imageChange);
  document.addEventListener("click", click);
  document.addEventListener("submit", submit);
  return () => {
    disposed = true;
    imageInput?.removeEventListener("change", imageChange);
    document.removeEventListener("click", click);
    document.removeEventListener("submit", submit);
  };
}

import { fail } from "./security.mjs";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char]);
}

export async function sendEmail(cfg, { to, subject, text }) {
  if (!cfg.mail?.apiKey || !cfg.mail?.from)
    fail(503, "إرسال البريد غير مهيأ بعد. أضف إعدادات البريد في الاستضافة.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + cfg.mail.apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: cfg.mail.from,
      to: [to],
      subject,
      text,
      html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.9;color:#302747;max-width:560px;margin:auto"><h2 style="color:#594775">رُزمة</h2><p>${escapeHtml(text).replace(/\n/g, "<br>")}</p><hr><small>إذا لم تطلب هذه الرسالة، يمكنك تجاهلها.</small></div>`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error("تعذر إرسال البريد حاليًا. حاول مرة أخرى لاحقًا.");
    err.status = 502;
    err.code = "EMAIL_PROVIDER_ERROR";
    throw err;
  }
  return result;
}

export function verificationMessage(code) {
  return `رمز التحقق من بريدك في رُزمة هو: ${code}\nينتهي الرمز خلال 10 دقائق، ويُستخدم مرة واحدة. لا تشاركه مع أي شخص.`;
}

export function resetMessage(code) {
  return `رمز إعادة تعيين كلمة المرور في رُزمة هو: ${code}\nينتهي الرمز خلال 10 دقائق، ويُستخدم مرة واحدة. إذا لم تطلب إعادة التعيين فتجاهل الرسالة.`;
}

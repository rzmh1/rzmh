import { account, api } from "./api.js";
import { escape as e } from "./data.js";
import { icon } from "./ui.js";

export function accountsPage() {
  return `<section class="accounts-page"><span class="eyebrow">حسابات رُزمة</span><h1>حسابك، وتقدّمك.</h1><p>ادخل ببريدك وكلمة مرور رُزمة، حتى لو اختلف بريدك عن حساب ChatGPT. لكل حساب جلسة واشتراك وتقدّم مستقل. التبديل هنا يخص علامة التبويب الحالية.</p><div id="saved-accounts" class="stack" aria-live="polite"></div><div class="accounts-actions"><a class="btn btn-primary" href="#/login?next=/accounts">${icon("user")} إضافة حساب آخر</a><a class="btn btn-outline" href="#/signup?next=/accounts">إنشاء حساب مجاني</a><a class="text-link" href="#/admin-login">دخول المالك</a></div><p class="smalltext">تسجيل الخروج ينهي جلسة الحساب المختار في هذا المتصفح فقط، ويحتفظ ببياناته وتقدّمه. استخدم هذه الميزة على جهازك الشخصي؛ الحسابات المحفوظة متاحة لمن يستخدم المتصفح.</p></section>`;
}
export function mountAccounts() {
  const root = document.querySelector("#saved-accounts");
  let disposed = false;
  root.textContent = "جارٍ تحميل الحسابات…";
  void api("/api/auth/accounts").then(({ accounts }) => {
    if (disposed) return;
    account.savedAccounts = accounts;
    root.innerHTML = accounts.length ? accounts.map((user) => `<article class="panel account-card"><span class="rz-avatar" aria-hidden="true">${e(user.name.slice(0, 1))}</span><div class="account-details"><h2>${e(user.name)}</h2><p dir="ltr">${e(user.email)}</p><small>${user.role === "admin" ? "المالك" : "طالب"}${user.id === account.user?.id ? " · الحساب الحالي" : ""}</small></div>${user.id === account.user?.id ? '<button class="btn btn-outline btn-sm" data-action="logout">تسجيل الخروج</button>' : `<button class="btn btn-primary btn-sm" data-action="switch-account" data-account="${e(user.id)}">التبديل إلى هذا الحساب</button>`}</article>`).join("") : "<p>لم تُحفظ أي جلسة نشطة. أضف حسابك للمتابعة.</p>";
  }).catch((err) => { if (!disposed) root.textContent = err.message; });
  return () => { disposed = true; };
}

import { api } from "./api.js";
import { escape as e } from "./data.js";

const names = {
  terms: "الشروط والأحكام",
  privacy: "سياسة الخصوصية",
  refund: "سياسة الاسترجاع والإلغاء",
  cookies: "سياسة ملفات الارتباط",
};

export function policyPage(key) {
  return `<section class="policy-page container" aria-labelledby="policy-title">
    <a class="policy-back" href="#/">العودة إلى الرئيسية</a>
    <div id="policy-content" class="policy-content" aria-live="polite">
      <span class="eyebrow">رُزمة · معلومات قانونية</span>
      <h1 id="policy-title">${e(names[key] || "السياسات")}</h1>
      <p>جارٍ تحميل المحتوى…</p>
    </div>
  </section>`;
}

export function mountPolicyPage(key) {
  let active = true;
  api("/api/policies").then((policies) => {
    if (!active || (location.hash.split(/[/?]/)[1] || "") !== key) return;
    const root = document.querySelector("#policy-content");
    if (!root) return;
    const item = policies[key];
    root.replaceChildren();
    const eyebrow = document.createElement("span");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "رُزمة · معلومات قانونية";
    const heading = document.createElement("h1");
    heading.id = "policy-title";
    heading.textContent = item?.title || names[key];
    root.append(eyebrow, heading);
    if (!item?.content) {
      const note = document.createElement("p");
      note.className = "policy-unpublished";
      note.textContent = "هذه السياسة قيد الإعداد، وسيتم نشرها بعد اعتمادها من إدارة رُزمة.";
      root.append(note);
      return;
    }
    const body = document.createElement("div");
    body.className = "policy-body";
    body.textContent = item.content;
    root.append(body);
  }).catch(() => {
    const root = document.querySelector("#policy-content");
    if (root) root.textContent = "تعذر تحميل السياسة حاليًا. حاول تحديث الصفحة.";
  });
  return () => { active = false; };
}

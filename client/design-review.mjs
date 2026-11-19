import {
  storeTeachersPage,
  storeTrackPage,
  mountCatalog,
} from "../dist/store-catalog.js";
// A read-only review built from the actual public components. No backend or auth is simulated.
import { db, escape as e } from "../dist/data.js";
import * as pages from "../dist/pages.js";
import { header, footer, icon, empty, btn } from "../dist/ui.js";
import { updatesPage, mountStorefront } from "../dist/storefront.js";
import { mountDrawing } from "../dist/drawing.js";
const app = document.querySelector("#app");
Object.assign(db, __RUZMAH_REVIEW_CONTENT__);
let dispose = () => {};
function toast(text) {
  const t = document.querySelector("#toast");
  t.textContent = text;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
}
function render() {
  dispose();
  const [path, id, lesson] = location.hash
    .split("?")[0]
    .replace(/^#\/?/, "")
    .split("/");
  let content,
    wrapped = true;
  switch (path || "home") {
    case "home":
      content = pages.home();
      wrapped = false;
      break;
    case "pricing":
      content = pages
        .pricing()
        .replace('<h2 id="membership-title">', '<h1 id="membership-title">')
        .replace("</h2>", "</h1>");
      wrapped = false;
      break;
    case "updates":
      content = updatesPage();
      wrapped = false;
      break;
    case "sections":
      content = pages.sectionsPage();
      break;
    case "section":
      content = pages.sectionsPage(id);
      break;
    case "course":
      content = pages.coursePage(
        id,
        new URLSearchParams(location.hash.split("?")[1] || "").get("preview"),
      );
      break;
    case "instructors":
      content = storeTeachersPage();
      break;
    case "instructor":
      content = storeTeachersPage(id);
      break;
    case "track":
      content = storeTrackPage(id);
      break;
    case "lesson":
      content = pages.lessonPage(id, lesson);
      break;
    case "scratch":
      content = pages.scratchPage();
      break;
    case "tools":
      content = `<div class="page-heading"><span class="eyebrow">مساحة المذاكرة</span><h1>أدوات تكمل رحلتك.</h1><p>في نسخة التشغيل ترتبط بيانات هذه الأدوات بحساب الطالب.</p></div>${pages.toolsGrid()}`;
      break;
    case "about":
      content = pages.aboutPage();
      break;
    default: {
      const plan = db.plans.find((p) => p.id === id);
      content = empty(
        path === "subscription" && plan
          ? `مراجعة اشتراك ${e(plan.title)} — ${plan.price.toFixed(2)} ريال`
          : "هذه الخطوة في نسخة التشغيل.",
        "هذه معاينة للواجهة من ملفات المشروع نفسها. اختيار المدرسين والرحلة الترحيبية والجدولة والحسابات تحتاج تشغيل خادم رُزمة. لا تُحاكي هذه المعاينة حفظ البيانات أو تشغّل الدفع.",
        "lock",
        btn("العودة للمسارات", "#/sections", "outline"),
      );
    }
  }
  app.innerHTML = `<div class="design-review-note" role="note">معاينة الواجهة الفعلية · المحتوى الافتراضي موسوم للتوضيح · الحسابات والدفع يعملان عند تشغيل الخادم</div>${header()}<main id="main" tabindex="-1" ${wrapped ? 'class="container page-content"' : ""}>${content}</main>${footer()}`;
  const a = mountStorefront(),
    b = path === "scratch" ? mountDrawing(toast) : () => {},
    c = [
      "sections",
      "section",
      "track",
      "instructors",
      "instructor",
      "course",
    ].includes(path)
      ? mountCatalog()
      : () => {};
  dispose = () => {
    a();
    b();
    c();
  };
  window.scrollTo(0, 0);
  const anchor =
    path === "course" &&
    new URLSearchParams(location.hash.split("?")[1] || "").get("preview")
      ? "course-preview"
      : !path || path === "home"
        ? new URLSearchParams(location.hash.split("?")[1] || "").get("section")
        : null;
  if (anchor && /^[a-z-]+$/.test(anchor))
    document.getElementById(anchor)?.scrollIntoView({ block: "start" });
}
document.addEventListener("click", (ev) => {
  if (ev.target.closest(".skip")) {
    ev.preventDefault();
    document.querySelector("#main")?.focus({ preventScroll: true });
    document.querySelector("#main")?.scrollIntoView({ block: "start" });
    return;
  }
  const button = ev.target.closest("button");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "theme") {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    button.innerHTML = icon(dark ? "sun" : "moon");
    button.setAttribute(
      "aria-label",
      dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي",
    );
    try {
      localStorage.setItem("ruzmah-theme", dark ? "dark" : "light");
    } catch {}
  }
  if (action === "mobile-menu") {
    const isOpen = document.querySelector("#main-nav").classList.toggle("open");
    button.setAttribute("aria-expanded", isOpen);
    button.innerHTML = icon(isOpen ? "close" : "menu");
  }
  if (button.dataset.subject) {
    document
      .querySelectorAll("[data-subject]")
      .forEach((x) => x.classList.toggle("active", x === button));
    const courses = db.courses.filter(
      (c) =>
        c.visible &&
        c.sectionId === idFromHash() &&
        (button.dataset.subject === "all" ||
          c.subject === button.dataset.subject),
    );
    import("../dist/ui.js").then(({ courseCard }) => {
      document.querySelector("#section-courses").innerHTML =
        courses.map(courseCard).join("") ||
        empty(
          "لا يوجد محتوى في هذا التصنيف",
          "تُضاف الدورات من الإدارة في نسخة التشغيل.",
        );
    });
  }
  if (
    button.dataset.answer ||
    action === "complete-lesson" ||
    action === "retry"
  )
    toast("حفظ الإجابات والتقدم متاح في نسخة التشغيل بعد تسجيل الدخول.");
});
const idFromHash = () => location.hash.split("/")[2];
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    document.querySelector("#main-nav")?.classList.remove("open");
    const b = document.querySelector('[data-action="mobile-menu"]');
    b?.setAttribute("aria-expanded", "false");
    if (b) {
      b.innerHTML = icon("menu");
      b.focus();
    }
  }
});
window.addEventListener("hashchange", render);
render();

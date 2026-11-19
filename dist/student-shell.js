import { account } from "./api.js";
import { escape as e } from "./data.js";
import { icon, logo } from "./ui.js";

// صفحات منصة الطالب. تظهر داخل غلاف مستقل عن المتجر (بلا قائمة المتجر ولا تذييله).
export const studentRoutes = [
  "dashboard",
  "welcome",
  "choose",
  "journey",
  "learning-settings",
  "bank",
  "tests",
  "quiz",
  "results",
  "mistakes",
  "plan",
  "progress",
  "tutor",
  "scratch",
  "lesson",
  "subscription",
];

export const inStudentSpace = (route) =>
  studentRoutes.includes(route) &&
  !!account.user &&
  (account.entitled || account.user.role === "admin");

// المجموعات: [المعرّف, الأيقونة, الاسم]
const groups = [
  [
    "تعلّم",
    [
      ["dashboard", "shapes", "اليوم"],
      ["choose", "book", "دوراتي"],
      ["sections", "layers", "كل الأقسام"],
    ],
  ],
  [
    "تدرّب",
    [
      ["bank", "target", "بنك الأسئلة"],
      ["tests", "clock", "الاختبارات"],
      ["mistakes", "error", "دفتر الأخطاء"],
    ],
  ],
  [
    "أدواتي",
    [
      ["tutor", "spark", "المدرّس الذكي"],
      ["scratch", "pen", "المسودة"],
      ["plan", "calendar", "مهامي"],
    ],
  ],
];

// الشريط السفلي في الجوال: الأهم فقط
const tabs = [
  ["dashboard", "shapes", "اليوم"],
  ["choose", "book", "دوراتي"],
  ["bank", "target", "تدريب"],
  ["tests", "clock", "اختبارات"],
  ["tutor", "spark", "المدرّس"],
];

const activeOf = (route) =>
  ({
    journey: "dashboard",
    progress: "dashboard",
    welcome: "dashboard",
    "learning-settings": "dashboard",
    quiz: "tests",
    results: "tests",
    lesson: "choose",
  })[route] || route;

const initial = () => e((account.user?.name || "ط").trim().slice(0, 1));

export function studentHeader() {
  const admin = account.user?.role === "admin";
  return `<header class="app-bar"><div class="app-bar-inner"><button class="icon-btn app-menu-btn" data-action="student-menu" aria-label="القائمة" aria-expanded="false">${icon("menu")}</button>${logo()}<span class="app-bar-space"></span>${admin ? `<a class="app-bar-link" href="#/admin">${icon("settings")}<span>الإدارة</span></a>` : ""}<button class="icon-btn theme-toggle" data-action="theme" aria-label="تبديل الوضع الليلي">${icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}</button><a class="app-user" href="#/subscription" aria-label="حسابي"><span class="app-avatar">${initial()}</span><span class="app-user-name">${e(account.user?.name || "")}</span></a></div></header>`;
}

export function studentSidebar(active) {
  const current = activeOf(active);
  return `<aside class="app-side" id="app-side" aria-label="قائمة الطالب"><nav>${groups
    .map(
      ([title, items]) =>
        `<div class="app-nav-group"><span class="app-nav-title">${title}</span>${items
          .map(
            ([id, ico, label]) =>
              `<a class="${current === id ? "active" : ""}" href="#/${id}" ${current === id ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></a>`,
          )
          .join("")}</div>`,
    )
    .join("")}</nav><div class="app-side-foot"><a class="${current === "subscription" ? "active" : ""}" href="#/subscription">${icon("user")}<span>اشتراكي وحسابي</span></a><a href="#/learning-settings">${icon("clock")}<span>وقتي وإعداداتي</span></a><a href="#/">${icon("arrow")}<span>موقع رُزمة</span></a><button data-action="logout">${icon("logout")}<span>تسجيل الخروج</span></button></div></aside>`;
}

export function studentTabbar(active) {
  const current = activeOf(active);
  return `<nav class="app-tabs" aria-label="التنقل السريع">${tabs
    .map(
      ([id, ico, label]) =>
        `<a class="${current === id ? "active" : ""}" href="#/${id}" ${current === id ? 'aria-current="page"' : ""}>${icon(ico)}<span>${label}</span></a>`,
    )
    .join("")}</nav>`;
}

// يلفّ محتوى الصفحة في غلاف الطالب الكامل.
export function studentFrame(content, active) {
  return `${studentHeader()}<div class="app-shell">${studentSidebar(active)}<main id="main" tabindex="-1" class="app-main">${content}</main></div>${studentTabbar(active)}<button class="app-scrim" data-action="student-menu" aria-label="إغلاق القائمة" tabindex="-1"></button>`;
}

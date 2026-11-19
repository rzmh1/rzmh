import { storeConfig } from "./store-config.js";
import { account } from "./api.js";
import {
  db,
  student,
  escape as e,
  safeUrl,
  visibleSections,
  sectionName,
  money,
} from "./data.js";
const paths = {
  arrow: "M19 12H5m7 7-7-7 7-7",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  check: "m5 12 4 4L19 6",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "m6 6 12 12M6 18 18 6",
  book: "M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14",
  play: "m9 5 11 7-11 7Z",
  spark: "m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z",
  clock: "M12 8v5l3 2M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z",
  target:
    "M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0ZM17 12a5 5 0 1 0-10 0 5 5 0 0 0 10 0ZM12 10v4m-2-2h4",
  pen: "m4 16 12-12 4 4L8 20H4Zm10-10 4 4",
  chart: "M4 3v17h17M8 15l4-5 4 2 5-8",
  calendar:
    "M7 2v4m10-4v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2ZM7 13h3m4 0h3m-10 4h3",
  layers: "m12 3 10 5-10 5L2 8Zm-10 9 10 5 10-5M2 16l10 5 10-5",
  error: "M5 3h10l4 4v14H5Zm10 0v5h4m-9 4 4 4m0-4-4 4",
  shapes:
    "M3 4h7v7H3ZM17 3l5 8H12ZM10 18a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm4-3h7v7h-7",
  atom: "M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM21 7c2 3-1 7-6 10s-11 3-12 0 1-7 6-10 10-3 12 0ZM3 7c-2 3 1 7 6 10s11 3 12 0-1-7-6-10S5 4 3 7Z",
  language:
    "M2 5h12M8 2v3m-4 0c0 6 5 10 9 11M12 5c0 6-5 10-9 11m10 5 5-13 5 13m-8-4h6",
  user: "M16 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21v-3a8 8 0 0 1 16 0v3",
  logout: "M9 3H3v18h6m5-14 5 5-5 5m-7-5h12",
  lock: "M6 10h12v11H6Zm3 0V6a3 3 0 0 1 6 0v4",
  mail: "M3 5h18v14H3Zm0 1 9 7 9-7",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  upload: "M12 17V3m-5 5 5-5 5 5M3 15v6h18v-6",
  download: "M12 3v14m-5-5 5 5 5-5M3 18v3h18v-3",
  plus: "M12 4v16M4 12h16",
  file: "M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8m-8 4h8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  undo: "m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12",
  search: "M16 16l5 5M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0Z",
};
export const icon = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
export const logo = () => {
  const original = safeUrl(db.brand.logo),
    dark = safeUrl(db.brand.logoDark);
  return `<a href="#/" class="logo ${original && dark ? "logo--variants" : ""}" aria-label="رُزمة، الرئيسية">${original ? `<img class="logo-original" src="${original}" alt="شعار رُزمة">${dark ? `<img class="logo-dark" src="${dark}" alt="شعار رُزمة">` : ""}` : `<span class="logo-mark">${icon("layers")}</span><span>${e(db.brand.name)}</span><i>RUZMAH</i>`}</a>`;
};
export function header() {
  const space =
      account.user?.role === "admin"
        ? "admin"
        : account.entitled
          ? "dashboard"
          : "subscription",
    label =
      account.user?.role === "admin"
        ? "الإدارة"
        : account.entitled
          ? "منصة الطالب"
          : "حسابي المجاني";
  const config = storeConfig(db),
    features = config.sections.some((s) => s.id === "features" && s.visible);
  return `<header class="site-header"><div class="container header-inner">${logo()}<nav id="main-nav" aria-label="التنقل الرئيسي"><a href="#/" class="nav-home">الرئيسية</a><details class="nav-dropdown"><summary>الأقسام ${icon("down")}</summary><div class="dropdown-panel">${visibleSections()
    .map(
      (s) =>
        `<a href="#/section/${s.id}">${icon(s.icon)}<span>${e(s.title)}</span>${s.status === "coming" ? "<small>قريبًا</small>" : icon("arrow")}</a>`,
    )
    .join(
      "",
    )}<a href="#/sections">${icon("layers")}<span>كل الأقسام والدورات</span>${icon("arrow")}</a></div></details><a href="#/instructors">المدرسون</a>${features ? '<a href="#/?section=features">المميزات</a>' : ""}<a href="#/updates">التحديثات</a><a href="#/pricing">الباقات</a><a class="nav-auth-link" href="#/${account.user ? space : "login"}">${account.user ? label : "تسجيل الدخول"} ${icon("arrow")}</a></nav><div class="header-actions"><button class="icon-btn theme-toggle" data-action="theme" aria-label="تبديل الوضع الليلي">${icon(document.documentElement.dataset.theme === "dark" ? "sun" : "moon")}</button>${!account.user ? '<a href="#/login" class="login-link">تسجيل الدخول</a>' : ""}<a href="#/${account.user ? space : "signup"}" class="btn btn-dark btn-sm">${account.user ? label : "إنشاء حساب مجاني"} ${icon("arrow")}</a><button class="icon-btn mobile-toggle" data-action="mobile-menu" aria-label="فتح قائمة التنقل" aria-controls="main-nav" aria-expanded="false">${icon("menu")}</button></div></div></header>`;
}
export const footer = () => {
  const email = storeConfig(db).supportEmail;
  return `<footer><div class="container"><div class="footer-top"><div>${logo()}<p>طموحك يستاهل استعدادًا أفضل.</p>${email ? `<a class="footer-email" href="mailto:${e(email)}">${icon("mail")}<span dir="ltr">${e(email)}</span></a>` : ""}</div><div class="footer-links"><a href="#/sections">الأقسام والدورات</a><a href="#/instructors">المدرسون</a><a href="#/pricing">الباقات</a><a href="#/about">عن رُزمة</a>${account.user?.role === "admin" ? '<a href="#/admin">لوحة الإدارة</a>' : ""}${account.user ? '<button class="footer-logout" data-action="logout">تسجيل الخروج</button>' : ""}</div><span class="footer-note">صُنع لطموح طلاب السعودية <span>✦</span></span></div><div class="footer-bottom"><span>© ${new Date().getFullYear()} رُزمة. كل استعدادك في مكان واحد.</span><span>بدون تجديد تلقائي. قرارك دائمًا بيدك.</span></div></div></footer>`;
};
export const btn = (label, href, style = "primary") =>
  `<a class="btn btn-${style}" href="${href}">${label} ${icon("arrow")}</a>`;
export const badge = (text, style = "") =>
  `<span class="badge ${style}">${e(text)}</span>`;
export const pageHeading = (eyebrow, title, text = "") =>
  `<div class="page-heading"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${text ? `<p>${text}</p>` : ""}</div>`;
export const empty = (title, description, ico = "layers", action = "") =>
  `<div class="empty-state"><span class="empty-icon">${icon(ico)}</span><h3>${title}</h3><p>${description}</p>${action}</div>`;
export function courseArt(c) {
  if (c.thumbnailAssetId)
    return `<div class="course-art"><img src="/api/media/${e(c.thumbnailAssetId)}" alt="${e(c.title)}" loading="lazy"></div>`;
  if (c.thumbnail && safeUrl(c.thumbnail))
    return `<div class="course-art"><img src="${safeUrl(c.thumbnail)}" alt="${e(c.title)}"></div>`;
  return `<div class="course-art ${e(c.art)}"><span class="art-grid"></span><span class="art-label">رُزمة / ${e(c.subject)}</span>${c.art === "letters" ? '<span class="letter-main">ض</span><span class="letter-small">المعنى يصنع الفرق.</span>' : c.art === "physics" ? '<div class="atom-orbit orbit-a"></div><div class="atom-orbit orbit-b"></div><div class="atom-orbit orbit-c"></div><b class="atom-core"></b><span class="formula-small">v = d / t</span>' : '<span class="math-main">𝑥²</span><span class="math-equation">a² + b² = c²</span><span class="math-circle"></span>'}<span class="art-arrow">${icon("arrow")}</span></div>`;
}
export function courseCard(c) {
  const free = c.lessons.find((l) => l.free || c.access === "free");
  return `<article class="course-card editorial-course"><a class="art-link" href="#/course/${c.id}" aria-label="تفاصيل ${e(c.title)}">${courseArt(c)}</a><div class="course-body"><div class="course-meta"><span>${e(sectionName(c.sectionId))} <b>·</b> ${e(c.subject)}</span>${badge(c.status)}</div><h3><a href="#/course/${c.id}">${e(c.title)}</a></h3><div class="course-bottom"><span>${icon("book")} ${c.lessons.length} ${c.lessons.length === 1 ? "درس" : "دروس"}</span>${free ? `<a href="#/lesson/${c.id}/${free.id}">${icon("play")} شاهد درسًا مجانيًا</a>` : `<a href="#/course/${c.id}">تفاصيل الدورة ${icon("arrow")}</a>`}</div></div></article>`;
}
export function sectionCard(s) {
  const type =
    s.id === "qudrat"
      ? "qudrat"
      : s.id === "tahsili"
        ? "tahsili"
        : s.status === "coming"
          ? "step"
          : "default";
  const subjects = s.subjects
    .filter((v) => v !== "قريبًا")
    .slice(0, type === "qudrat" ? 6 : 4);
  return `<a href="#/section/${e(s.id)}" class="section-card route-card route-card--${type}"><div class="route-card-top"><span class="subject-icon">${icon(s.icon)}</span>${s.status === "coming" ? badge("عند إطلاق المحتوى") : icon("arrow")}</div><h3 ${s.id === "step" ? 'dir="ltr"' : ""}>${e(s.title)}</h3><p>${e(s.status === "coming" ? "فصل جديد في رحلتك. ضمن الاشتراك عند إطلاقه." : s.label)}</p><div class="route-card-subjects">${subjects.map((v) => `<span>${e(v)}</span>`).join("")}</div><span class="route-card-link">${s.status === "coming" ? "تعرّف على المسار القادم" : "تأسيس · شروحات · تدريب واختبارات"} ${icon("arrow")}</span></a>`;
}
export function priceCard(p) {
  const monthly = db.plans.find((x) => x.months === 1)?.price || 19.99;
  const saving = monthly * p.months - p.price;
  return `<article class="price-card ${p.months === 12 ? "featured" : ""}">${p.months === 12 ? '<div class="best-value">✦ أفضل قيمة لطموحك</div>' : ""}<div class="price-head"><h3>${e(p.title)}</h3>${saving > 0 ? `<span>وفّر ${Math.round((saving / (monthly * p.months)) * 100)}٪</span>` : "<span>بداية مرنة</span>"}</div><div class="price"><b dir="ltr">${money(p.price)}</b><span>ريال سعودي<br><small>لكامل المدة</small></span></div><div class="price-saving">${saving > 0 ? `توفر ${money(saving)} ريال مقارنة بالسعر الشهري` : "مساحة لتكتشف طريقتك"}</div><a href="#/subscription/${p.id}" class="btn ${p.months === 12 ? "btn-primary" : "btn-outline"}">اشترك ${e(p.title)} ${icon("arrow")}</a><p class="price-caption">وصول شامل لجميع المسارات والمميزات</p></article>`;
}
export const notice = (text, ico = "spark") =>
  `<div class="notice">${icon(ico)}<p>${text}</p></div>`;

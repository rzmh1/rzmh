import { mediaUrl } from "./api.js";
import { catalogShowcase, stageComparison } from "./store-catalog.js";
import { storeConfig } from "./store-config.js";
import { previewLessonId } from "./course-policy.js";
import { account } from "./api.js";
import {
  db,
  visibleSections,
  visibleCourses,
  allFeatures,
  escape as e,
  safeUrl,
  money,
} from "./data.js";
import { icon, btn, badge, sectionCard, courseArt, empty } from "./ui.js";

const feedTypes = [
  ["all", "كل الجديد", "layers"],
  ["collections", "التجميعات والتسريبات", "file"],
  ["tests", "اختبارات التحديثات", "clock"],
  ["weekly", "الأكثر تكرارًا أسبوعيًا", "chart"],
  ["questions", "أحدث الأسئلة", "book"],
];
const arabicDate = (value) => {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat("ar-SA", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(time)
    : "";
};
const classify = (item) =>
  /اختبار/.test(item.type)
    ? "tests"
    : /تكرار|أسبوع/.test(item.type)
      ? "weekly"
      : /تجميع|تسريب|متداول/.test(item.type)
        ? "collections"
        : /أسئلة|سؤال/.test(item.type)
          ? "questions"
          : "other";
const publishedUpdates = () =>
  db.updates
    .filter((u) => u.visible !== false)
    .sort(
      (a, b) => (Date.parse(b.updatedAt) || 0) - (Date.parse(a.updatedAt) || 0),
    );
const linkedTest = (u) =>
  (db.tests || []).find((t) => t.visible && t.id === u.testId);
const formatPercent = (n) =>
  new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 1 }).format(n) + "٪";
export function savings(plan) {
  const monthly = Math.round(
      (db.plans.find((p) => p.months === 1)?.price || 19.99) * 100,
    ),
    base = monthly * plan.months,
    total = Math.round(plan.price * 100);
  return {
    amount: (base - total) / 100,
    percent: base > 0 ? ((base - total) / base) * 100 : 0,
    base: base / 100,
  };
}

function learningVisual() {
  if (db.brand.heroImage && safeUrl(db.brand.heroImage))
    return `<div class="learning-visual supplied-visual"><img src="${safeUrl(db.brand.heroImage)}" alt="رُزمة — مسارات وأدوات للتعلم" fetchpriority="high"></div>`;
  const course = visibleCourses().find((c) =>
    c.lessons.some((l) => l.free || c.access === "free"),
  );
  const lesson = course?.lessons.find(
    (l) => l.free || course.access === "free",
  );
  const courseLink = course ? `#/course/${course.id}` : "#/sections";
  return `<div class="learning-visual" aria-label="نظرة على محتوى رُزمة ومسارات الاستعداد"><div class="visual-orbit visual-orbit-one"></div><div class="visual-orbit visual-orbit-two"></div><div class="folio-back folio-back-two"></div><div class="folio-back folio-back-one"></div><article class="learning-folio"><div class="folio-top"><span>${icon("book")} مساحة للفهم</span><small>رُزمة / ${e(course?.subject || "التعلّم")}</small></div><div class="folio-title"><span>من أول فكرة.</span><strong>إلى خطوة واثقة.</strong></div><div class="folio-diagram" aria-hidden="true"><svg viewBox="0 0 300 160" fill="none"><path d="M38 132H268M60 145V18" stroke="currentColor" opacity=".18"/><path d="M60 130 215 40 258 130Z" stroke="currentColor" stroke-width="1.7"/><path d="M214 40V130" stroke="currentColor" stroke-dasharray="4 5" opacity=".3"/><circle cx="60" cy="130" r="5" fill="currentColor"/><circle cx="215" cy="40" r="5" fill="currentColor"/><circle cx="258" cy="130" r="5" fill="currentColor"/><path d="M87 130a26 26 0 0 0-6-15" stroke="currentColor" opacity=".4"/><text x="115" y="69" font-family="Georgia,serif" font-size="25" fill="currentColor">𝑥</text><text x="135" y="154" font-family="Georgia,serif" font-size="15" fill="currentColor">a² + b² = c²</text></svg><span class="diagram-caption">افهم العلاقة، قبل أن تحفظ الحل.</span></div><a href="${courseLink}" class="folio-lesson"><span class="folio-play">${icon("play")}</span><span><small>${course ? "من المحتوى المتاح" : "اكتشف مسارك"}</small><b>${e(lesson?.title || "تأسيس وتدريب واختبار")}</b></span>${icon("arrow")}</a></article><div class="visual-note note-foundation">${icon("shapes")}<div><b>أساس واضح.</b><span>كمي ولفظي · علوم ومعارف</span></div></div><div class="visual-note note-practice"><span class="note-star">✦</span><div><b>الفهم أولًا. ثم التطبيق.</b><span>تعلّم بطريقتك، وفي وقتك.</span></div></div><span class="visual-spark visual-spark-one">✧</span><span class="visual-spark visual-spark-two">✦</span><span class="visual-caption">كل طموحك، في رُزمة.</span></div>`;
}

function updateRows(type = "all", limit = 3) {
  const rows = publishedUpdates().filter(
    (u) =>
      type === "all" ||
      classify(u) === type ||
      (type === "tests" && !!linkedTest(u)),
  );
  if (!rows.length) {
    const labels = {
      all: [
        "الجديد يبدأ من هنا.",
        "تظهر التحديثات عند نشرها من الإدارة، مع تاريخها الفعلي. لا يوجد محتوى منشور حاليًا.",
      ],
      collections: [
        "مساحة للتجميعات والمراجعة.",
        "لا توجد تجميعات أو تسريبات متداولة منشورة في هذا التصنيف بعد.",
      ],
      tests: [
        "بعد التحديث، فرصة للتطبيق.",
        "تظهر الاختبارات المرتبطة بتحديث منشور هنا. لم يُنشر اختبار تحديثات بعد.",
      ],
      weekly: [
        "الأفكار المتكررة تستحق انتباهك.",
        "لم يُنشر ملخص للأسئلة الأكثر تكرارًا هذا الأسبوع بعد.",
      ],
      questions: [
        "كل سؤال يضيف فكرة.",
        "لا توجد تحديثات منشورة لأحدث الأسئلة حاليًا.",
      ],
    };
    const [title, text] = labels[type] || labels.all;
    return `<div class="feed-empty"><div class="feed-empty-art" aria-hidden="true"><span>${icon(type === "tests" ? "clock" : "file")}</span><i></i><i></i><i></i></div><div><h3>${title}</h3><p>${text}</p><a class="text-link" href="#/sections">تصفح المحتوى المتاح ${icon("arrow")}</a></div></div>`;
  }
  return `<div class="feed-timeline">${rows
    .slice(0, limit)
    .map((u) => {
      const test = linkedTest(u),
        date = arabicDate(u.updatedAt),
        fileUrl = u.courseId
          ? "#/course/" + e(u.courseId)
          : u.free || account.entitled
            ? mediaUrl("/api/media/" + e(u.assetId))
            : "#/pricing";
      return `<article class="feed-entry"><span class="feed-entry-mark">${icon(classify(u) === "tests" ? "clock" : classify(u) === "weekly" ? "chart" : "file")}</span><div class="feed-entry-body"><div class="feed-entry-meta">${badge(u.type, "badge-purple")}${date ? `<time datetime="${e(u.updatedAt)}">${date}</time>` : ""}</div><h3>${e(u.title)}</h3><p>${e(u.body)}</p>${test ? `<a class="feed-entry-link" href="${account.entitled ? "#/tests/" + e(test.id) : "#/pricing"}">${icon("clock")} ${account.entitled ? "اختبر فهمك:" : "ضمن الاشتراك:"} ${e(test.title)} ${icon("arrow")}</a>` : ""}${u.courseId && visibleCourses().some((c) => c.id === u.courseId) ? `<a class="feed-entry-link" href="#/course/${e(u.courseId)}">${icon("book")} افتح المحتوى ${icon("arrow")}</a>` : ""}${u.assetId ? `<a class="feed-entry-link" href="${fileUrl}" ${fileUrl.startsWith("/api/media/") ? 'target="_blank" rel="noopener noreferrer"' : ""}>${icon("file")} افتح الملف التعليمي ${icon("arrow")}</a>` : ""}</div></article>`;
    })
    .join("")}</div>`;
}
export function dailyUpdates({ full = false, copy = null } = {}) {
  const latest = publishedUpdates()[0];
  copy ||= storeConfig(db).sections.find((s) => s.id === "updates");
  return `<section id="updates" class="daily-hub ${full ? "daily-hub-full" : ""}" aria-labelledby="daily-hub-title"><div class="container"><div class="section-heading"><div><span class="eyebrow">${e(copy.eyebrow)}</span><h2 id="daily-hub-title">${e(copy.title).replace(/\n/g, "<br>")}</h2><p>${e(copy.description)}</p></div>${full ? "" : `<a href="#/updates" class="text-link">مركز التحديثات ${icon("arrow")}</a>`}</div><div class="daily-hub-layout"><div class="daily-sidebar"><span class="daily-sidebar-label">اختر ما تتابعه</span><div class="feed-tabs" role="group" aria-label="تصنيف التحديثات">${feedTypes.map(([id, title, ico]) => `<button class="feed-tab ${id === "all" ? "active" : ""}" data-feed-filter="${id}" aria-pressed="${id === "all"}" aria-controls="daily-feed-panel">${icon(ico)}<span>${title}</span>${icon("arrow")}</button>`).join("")}</div><div class="daily-date">${icon("calendar")}<div><b>آخر نشر فعلي</b><span>${latest ? arabicDate(latest.updatedAt) : "بانتظار أول تحديث"}</span></div></div></div><div class="daily-main"><div class="daily-main-head"><span class="daily-label"><i></i> من رُزمة إليك</span><span>المحتوى المنشور فقط</span></div><div id="daily-feed-panel" aria-live="polite">${updateRows("all", full ? Infinity : 3)}</div></div></div><div class="daily-foot"><span>${icon("layers")} تجميعات وأسئلة متداولة عند نشرها</span><span>${icon("clock")} اختبارات مرتبطة بالتحديثات</span><span>${icon("chart")} مراجعة أسبوعية للأسئلة المتكررة</span></div></div></section>`;
}

function coursePreview(id) {
  const course = visibleCourses().find((c) => c.id === id);
  if (!course) return empty("المحتوى في الطريق", "ستظهر الدورات عند نشرها.");
  const lesson = course.lessons.find((l) => l.free || course.access === "free");
  return `<div class="spotlight-art">${courseArt(course)}<span class="spotlight-art-caption">${e(course.status)}</span></div><div class="spotlight-copy"><div class="spotlight-meta">${e(db.sections.find((s) => s.id === course.sectionId)?.title || "")} <span>/</span> ${e(course.subject)}</div><h3>${e(course.title)}</h3><p>${e(course.description)}</p>${lesson ? `<a class="spotlight-lesson" href="#/course/${course.id}?preview=${lesson.id}"><span>${icon("play")}</span><div><small>درس مجاني متاح</small><b>${e(lesson.title)}</b></div>${icon("arrow")}</a>` : ""}<a href="#/course/${course.id}" class="text-link">استكشف محتوى الدورة ${icon("arrow")}</a></div>`;
}
function curriculum() {
  const courses = visibleCourses().slice(0, 4),
    hasFree = courses.some((c) =>
      c.lessons.some((l) => l.free || c.access === "free"),
    );
  return `<section class="curriculum-section"><div class="container"><div class="section-heading"><div><span class="eyebrow">الفهم يصنع البداية</span><h2>شرح يقرّب الفكرة.<br>وتأسيس تبني عليه.</h2></div><p>${hasFree ? "تعرّف على المحتوى المتاح، وخذ خطوتك الأولى من درس مجاني." : "تعرّف على المحتوى المتاح، واختر الدورة الأقرب لاحتياجك."}</p></div>${courses.length ? `<div class="curriculum-layout"><div class="curriculum-list" role="tablist" aria-label="معاينة الدورات">${courses.map((c, i) => `<button id="course-tab-${e(c.id)}" class="curriculum-tab ${i === 0 ? "active" : ""}" data-course-preview="${e(c.id)}" role="tab" aria-selected="${i === 0}" aria-controls="course-spotlight" tabindex="${i === 0 ? 0 : -1}"><span class="curriculum-number">${String(i + 1).padStart(2, "0")}</span><span><small>${e(c.subject)}</small><b>${e(c.title)}</b></span>${icon("arrow")}</button>`).join("")}<a class="curriculum-all" href="#/sections">كل المسارات والدورات ${icon("arrow")}</a></div><div id="course-spotlight" class="course-spotlight" role="tabpanel" aria-labelledby="course-tab-${e(courses[0].id)}">${coursePreview(courses[0].id)}</div></div>` : empty("مساحة لمحتوى يستحق طموحك.", "لا توجد دورات منشورة حاليًا. ستظهر هنا بعد إضافتها من الإدارة.", "book")}</div></section>`;
}

function featureBento(heading) {
  const items = [
    [
      "layers",
      "مصادر متعددة. وخيارك أنت.",
      "اختر مدرسًا للتأسيس وآخر للتدريب في كل مسار، وغيّر اختيارك متى شئت.",
    ],
    [
      "target",
      "تدريب يشبه الاختبار.",
      "أسئلة مصنّفة بشروح للإجابات، واختبارات مؤقتة تعوّدك على أجواء الاختبار.",
    ],
    [
      "calendar",
      "خطة تناسب وقتك.",
      "توزّع الدورات التي اخترتها على أيامك حسب مدد المقاطع وموعد اختبارك.",
    ],
    [
      "spark",
      "مدرّس ذكي بجانبك.",
      db.services?.ai
        ? "اسأله عن أي فكرة أو سؤال، ويشرح لك خطوة بخطوة. متاح للمشتركين."
        : "اسأله عن أي فكرة أو سؤال، ويشرح لك خطوة بخطوة عند تفعيل الخدمة.",
    ],
  ];
  return `<section class="why-section" id="features"><div class="container">${heading}<div class="why-grid">${items
    .map(
      ([ico, title, text], i) =>
        `<article class="why-card"><span class="why-icon">${icon(ico)}</span><b class="why-num" aria-hidden="true">0${i + 1}</b><h3>${title}</h3><p>${text}</p></article>`,
    )
    .join("")}</div></div></section>`;
}
function closingCta() {
  return `<section class="closing-cta"><div class="container"><div class="closing-card"><div><h2>جاهز تبدأ؟</h2><p>اشترك مرة واحدة، وادخل منصة الطالب بكل مساراتك.</p></div><div class="closing-actions">${btn("اختر اشتراكك", "#/pricing", "white")}${btn("استعرض الدورات", "#/sections", "ghost")}</div></div></div></section>`;
}

export function subscriptionSection() {
  const annual = db.plans.find((p) => p.months === 12),
    other = db.plans.filter((p) => p.months !== 12);
  if (!annual) return "";
  const annualSave = savings(annual),
    copy = storeConfig(db).sections.find((s) => s.id === "pricing");
  return `<section class="membership-section" id="pricing" aria-labelledby="membership-title"><div class="container"><div class="membership-heading"><span class="eyebrow">${e(copy.eyebrow)}</span><h2 id="membership-title">${e(copy.title).replace(/\n/g, "<br>")}</h2><p>${e(copy.description)}</p></div><div class="membership-layout"><article class="membership-annual"><div class="annual-top"><span>${icon("spark")} أفضل قيمة</span><b>${formatPercent(annualSave.percent)} توفير</b></div><div class="annual-duration">${e(annual.title)}</div><div class="annual-price"><b dir="ltr">${money(annual.price)}</b><span>ريال سعودي<small>إجمالي الاشتراك لسنة</small></span></div><p class="annual-saving">توفّر <strong>${money(annualSave.amount)} ريال</strong> مقارنة بـ <s>${money(annualSave.base)}</s> ريال بالسعر الشهري.</p><div class="annual-paths"><span>القدرات</span><span>التحصيلي</span><span>STEP عند إطلاقه</span></div><a href="#/subscription/${annual.id}" class="btn btn-white annual-cta">اشترك سنة كاملة ${icon("arrow")}</a><small class="annual-caption">كل المسارات والأدوات. دفعة واحدة.</small><span class="annual-watermark" aria-hidden="true">✦</span></article><div class="membership-options"><div class="membership-options-head"><h3>ابدأ بالمدة التي تناسبك.</h3><p>وصول شامل، مهما كانت مدتك.</p></div>${other
    .map((p) => {
      const save = savings(p);
      return `<article class="membership-duration"><div class="duration-name"><h3>${e(p.title)}</h3><span>${save.amount > 0 ? `توفير ${formatPercent(save.percent)}` : "بداية مرنة"}</span></div><div class="duration-price"><b dir="ltr">${money(p.price)}</b><span>ريال<small>لكامل المدة</small></span></div><a class="duration-cta" href="#/subscription/${p.id}" aria-label="الاشتراك لمدة ${e(p.title)} بسعر ${money(p.price)} ريال">اشترك ${icon("arrow")}</a>${save.amount > 0 ? `<div class="duration-saving">توفر ${money(save.amount)} ريال مقارنة بالسعر الشهري.</div>` : ""}</article>`;
    })
    .join(
      "",
    )}</div></div><div class="membership-includes"><h3>كل المدد تشمل</h3><div>${allFeatures.map((f) => `<span>${icon("check")}${f}</span>`).join("")}</div></div><p class="membership-assurance">${icon("lock")} لا يوجد تجديد تلقائي دون موافقة صريحة. السعر المعروض لكامل المدة.</p></div></section>`;
}

const heading = (copy) =>
  `<div class="section-heading"><div><span class="eyebrow">${e(copy.eyebrow)}</span><h2>${e(copy.title).replace(/\n/g, "<br>")}</h2></div><p>${e(copy.description)}</p></div>`;
function quantityDoors(copy) {
  const tracks = (db.tracks || []).filter(
    (t) => t.visible && t.sectionId === "qudrat",
  );
  return `<section class="store-path-section" id="qudrat"><div class="container">${heading(copy)}<div class="store-path-grid">${tracks.map((t) => `<a class="store-path-card ${t.id.includes("verbal") ? "verbal" : "quant"}" href="#/track/${e(t.id)}"><span class="store-path-icon">${icon(t.id.includes("verbal") ? "book" : "shapes")}</span><span class="eyebrow">قدراتك، من زاوية جديدة</span><h3>${e(t.title)}</h3><p>${e(t.description || (t.id.includes("verbal") ? "افهم العلاقات والمعاني، وطوّر مهارات المفردات واستيعاب المقروء." : "ابنِ فهمك للأعداد والعلاقات والمسائل، وتدرّب على طرق الحل."))}</p><div class="store-path-tags"><span>تأسيس</span><span>تدريب</span><span>مدرسون ودورات</span></div><b>اكتشف محتوى المسار ${icon("arrow")}</b></a>`).join("") || empty("المسارات قيد الإعداد", "تظهر هنا بعد نشرها من الإدارة.")}</div></div></section>`;
}
function startSection(copy) {
  return `<section class="store-start-section" id="start"><div class="container">${heading(copy)}<div class="store-start-steps">${[
    [
      "01",
      "استكشف ما يناسبك",
      "تعرّف على الأقسام والمدرسين، واستعرض الدورات وعناوين مقاطعها ومددها.",
      "استكشف الأقسام",
      "#/sections",
    ],
    [
      "02",
      "جرّب أسلوب الشرح",
      "اختر مقطع المعاينة المتاح، ثم أنشئ حسابًا مجانيًا لمشاهدته.",
      "تصفح المعاينات",
      "#/sections",
    ],
    [
      "03",
      "اختر مدتك. وابدأ.",
      "راجع اشتراكك وأكمل الدفع الآمن. بعد تأكيده تبدأ من منصة الطالب.",
      "اختر اشتراكك",
      "#/pricing",
    ],
  ]
    .map(
      ([number, title, text, label, href]) =>
        `<article><span>${number}</span><h3>${title}</h3><p>${text}</p><a class="text-link" href="${href}">${label} ${icon("arrow")}</a></article>`,
    )
    .join("")}</div></div></section>`;
}
export function storefrontHome() {
  const title = e(db.brand.hero).split("\n"),
    config = storeConfig(db),
    hasFree = visibleCourses().some((c) => previewLessonId(c));
  const parts = {
    exams: (c) =>
      `<section class="route-section" id="exams"><div class="container">${heading(c)}<div class="section-grid">${visibleSections().map(sectionCard).join("")}</div></div></section>`,
    qudrat: quantityDoors,
    stages: (c) =>
      `<section class="store-stage-section" id="stages"><div class="container">${heading(c)}${stageComparison()}<div class="stage-comparison-note">${icon("user")} يمكنك اختيار مدرس للتأسيس وآخر للتدريب، في كل مسار.</div></div></section>`,
    catalog: (c) => catalogShowcase(heading(c)),
    features: (c) => featureBento(heading(c)),
    updates: (c) => dailyUpdates({ copy: c }),
    pricing: () => subscriptionSection(),
    start: startSection,
    faq: (c) =>
      `<section class="storefront-faq" id="faq"><div class="container">${heading(c)}<div class="storefront-faq-list">${config.faq.map(([q, a]) => `<details><summary>${e(q)}${icon("plus")}</summary><p>${e(a)}</p></details>`).join("")}</div></div></section>`,
  };
  return `<div class="storefront storefront-final rz-public-site"><section class="opening-section rz-public-hero"><div class="container"><div class="opening-grid"><div class="opening-copy"><span class="opening-kicker"><i></i> للقدرات والتحصيلي. ولكل طموح يستحق.</span><h1>${title[0]}${title.length > 1 ? `<br><span>${title.slice(1).join(" ")}</span>` : ""}</h1><p>${e(db.brand.description)}</p><div class="opening-actions">${btn("استكشف الأقسام", "#/sections")}${btn("اشترك في رُزمة", "#/pricing", "outline")}</div><div class="opening-proof"><span>${icon("check")} كل المسارات في اشتراك واحد</span><span>${icon("play")} ${hasFree ? "معاينة المحتوى بحساب مجاني" : "استعرض المحتوى قبل الاشتراك"}</span></div></div>${learningVisual()}</div><div class="learning-promise"><span class="promise-label">استعداد متكامل.<br><b>من البداية إلى الاختبار.</b></span><span>${icon("book")} تأسيس وشروحات</span><span>${icon("layers")} مصادر ومدرسون</span><span>${icon("clock")} تدريب واختبارات</span><span>${icon("spark")} أدوات ومدرّس ذكي</span></div></div></section>${config.sections
    .filter((c) => c.visible)
    .map((c) => parts[c.id](c))
    .join("")}${closingCta()}</div>`;
}
export function updatesPage() {
  return `<div class="storefront updates-page"><div class="container updates-page-heading"><span class="eyebrow">الجديد في رُزمة</span><h1>مساحة واحدة.<br>لكل ما يستحق المراجعة.</h1><p>التجميعات والمتداول من الأسئلة، التحديثات، الاختبارات المرتبطة بها، والمراجعة الأسبوعية.</p></div>${dailyUpdates({ full: true })}</div>`;
}
export function mountStorefront() {
  const click = (ev) => {
    const feed = ev.target.closest("[data-feed-filter]");
    if (feed) {
      document.querySelectorAll("[data-feed-filter]").forEach((b) => {
        b.classList.toggle("active", b === feed);
        b.setAttribute("aria-pressed", b === feed);
      });
      const target = document.querySelector("#daily-feed-panel");
      if (target)
        target.innerHTML = updateRows(
          feed.dataset.feedFilter,
          document.querySelector(".daily-hub-full") ? Infinity : 3,
        );
    }
    const course = ev.target.closest("[data-course-preview]");
    if (course) {
      document.querySelectorAll("[data-course-preview]").forEach((b) => {
        b.classList.toggle("active", b === course);
        b.setAttribute("aria-selected", b === course);
        b.tabIndex = b === course ? 0 : -1;
      });
      const target = document.querySelector("#course-spotlight");
      if (target) {
        target.innerHTML = coursePreview(course.dataset.coursePreview);
        target.setAttribute("aria-labelledby", course.id);
      }
    }
  };
  const keydown = (ev) => {
    const tab = ev.target.closest("[data-course-preview]");
    if (
      !tab ||
      ![
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
      ].includes(ev.key)
    )
      return;
    ev.preventDefault();
    const tabs = [...document.querySelectorAll("[data-course-preview]")],
      index = tabs.indexOf(tab),
      next =
        ev.key === "Home"
          ? 0
          : ev.key === "End"
            ? tabs.length - 1
            : (index +
                (["ArrowLeft", "ArrowDown"].includes(ev.key) ? 1 : -1) +
                tabs.length) %
              tabs.length;
    tabs[next].focus();
    tabs[next].click();
  };
  document.addEventListener("click", click);
  document.addEventListener("keydown", keydown);
  return () => {
    document.removeEventListener("click", click);
    document.removeEventListener("keydown", keydown);
  };
}

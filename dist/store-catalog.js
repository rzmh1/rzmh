import { mediaUrl } from "./api.js";
import {
  db,
  visibleCourses,
  visibleSections,
  escape as e,
  safeUrl,
} from "./data.js";
import { account } from "./api.js";
import { icon, btn, badge, courseArt, sectionCard, empty } from "./ui.js";
import {
  previewLessonId,
  isPreview,
  canReadLesson,
  authLink,
} from "./course-policy.js";
import { storeConfig } from "./store-config.js";

export const stageLabel = (s) =>
  ({ foundation: "تأسيس", training: "تدريب", review: "مراجعة" })[s] || "تعلم";
export function clipTime(seconds) {
  if (!(seconds > 0)) return "المدة قيد الإضافة";
  const n = Math.ceil(seconds);
  return (
    (n >= 3600 ? Math.floor(n / 3600) + ":" : "") +
    String(Math.floor((n % 3600) / 60)).padStart(2, "0") +
    ":" +
    String(n % 60).padStart(2, "0")
  );
}
export function courseMetrics(c) {
  const lessons = (c.lessons || []).filter((l) => l.visible !== false),
    videos = lessons.filter((l) => l.video || l.videoAssetId || l.videoUrl);
  return {
    lessons: lessons.length,
    clips: videos.length,
    texts: lessons.length - videos.length,
    seconds: videos.reduce((n, l) => n + (l.durationSeconds || 0), 0),
    unknown: videos.filter((l) => !l.durationSeconds).length,
    files: lessons.reduce(
      (n, l) => n + (l.attachmentCount ?? l.fileAssetIds?.length ?? 0),
      0,
    ),
  };
}
const teacherFor = (c) =>
  (db.instructors || []).find(
    (t) => t.id === c.instructorId && t.published && !t.deleted,
  );
const durationCaption = (m) =>
  m.clips
    ? m.seconds
      ? clipTime(m.seconds) +
        (m.unknown ? " مدة فيديو معروفة" : " إجمالي الفيديو")
      : "مدد الفيديو قيد الإضافة"
    : "دروس نصية";
const crumbs = (links) =>
  `<div class="breadcrumbs">${links.map(([title, url]) => (url ? `<a href="${url}">${e(title)}</a>` : `<span>${e(title)}</span>`)).join(icon("chevron"))}</div>`;
const pick = (items, ids, limit) =>
  (ids.length
    ? ids.map((id) => items.find((x) => x.id === id)).filter(Boolean)
    : items
  ).slice(0, limit);
export function publicCourseCard(c) {
  const t = teacherFor(c),
    m = courseMetrics(c),
    preview = previewLessonId(c);
  return `<article class="catalog-course"><a href="#/course/${e(c.id)}" class="catalog-course-art" aria-label="استعراض ${e(c.title)}">${courseArt(c)}<span class="catalog-stage">${stageLabel(c.stage)}</span></a><div class="catalog-course-body"><small>${e(db.sections.find((s) => s.id === c.sectionId)?.title || "")} / ${e(c.subject)}</small><h3><a href="#/course/${e(c.id)}">${e(c.title)}</a></h3>${t ? `<a class="catalog-teacher" href="#/instructor/${e(t.id)}">${icon("user")}${e(t.name)}</a>` : '<span class="catalog-teacher">محتوى رُزمة</span>'}<p>${e(c.description)}</p><div class="catalog-course-meta"><span>${icon("play")}${m.clips ? m.clips + " مقاطع" : m.texts + " دروس نصية"}</span><span>${icon("clock")}${durationCaption(m)}</span></div><div class="catalog-card-bottom"><a href="#/course/${e(c.id)}" class="text-link">تفاصيل الدورة ${icon("arrow")}</a><span>${preview ? "معاينة بحساب مجاني" : "ضمن رُزمة الشاملة"}</span></div>${/نموذج|توضيح/.test(c.status || "") ? '<small class="catalog-demo">محتوى توضيحي مرفق بالمشروع</small>' : ""}</div></article>`;
}
export function publicTeacherCard(t, options = {}) {
  const profile = options?.profile === true,
    tag = profile ? "article" : "a",
    nameTag = profile ? "h1" : "h3";
  const courses = visibleCourses().filter((c) => c.instructorId === t.id),
    metrics = courses.map(courseMetrics),
    seconds = metrics.reduce((n, m) => n + m.seconds, 0),
    photo = t.imageAssetId
      ? mediaUrl("/api/media/" + e(t.imageAssetId))
      : safeUrl(t.imageUrl);
  return `<${tag} class="store-teacher" ${profile ? "" : `href="#/instructor/${e(t.id)}"`}><div class="store-teacher-photo">${photo ? `<img src="${photo}" alt="${e(t.name)}" loading="lazy">` : `<span aria-hidden="true">${e(t.name.slice(0, 1))}</span>`}<i>${icon(t.kind === "source" ? "book" : "user")}</i></div><div><small>${t.kind === "source" ? "مصدر تعليمي" : "مدرّس"} · ${e(t.specialty || "محتوى تعليمي")}</small><${nameTag}>${e(t.name)}</${nameTag}><p>${e(t.bio || "تعرّف على الدورات المنشورة لهذا المصدر.")}</p><span>${courses.length} دورات · ${metrics.reduce((n, m) => n + m.clips, 0)} مقاطع${seconds ? " · " + clipTime(seconds) + " مدة معروفة" : ""}</span></div>${profile ? "" : icon("arrow")}</${tag}>`;
}
export function catalogShowcase(heading) {
  const config = storeConfig(db),
    teachers = pick(
      (db.instructors || []).filter((t) => t.published && !t.deleted),
      config.featuredInstructorIds,
      3,
    ),
    courses = pick(visibleCourses(), config.featuredCourseIds, 3);
  return `<section class="store-catalog-section" id="catalog"><div class="container">${heading}<div class="store-source-heading"><h3>اختر أسلوب الشرح الأقرب لك.</h3><a class="text-link" href="#/instructors">جميع المدرسين ${icon("arrow")}</a></div>${teachers.length ? `<div class="store-teacher-grid">${teachers.map(publicTeacherCard).join("")}</div>` : `<div class="catalog-empty-inline">${icon("user")}<p>لم تُنشر ملفات المدرسين بعد. تبقى الدورات المنشورة متاحة للاستعراض، وتظهر المصادر عند إضافتها.</p></div>`}<div class="store-source-heading"><h3>خذ نظرة على المحتوى، قبل الاشتراك.</h3><a class="text-link" href="#/sections">جميع الدورات ${icon("arrow")}</a></div><div class="catalog-course-grid">${courses.map(publicCourseCard).join("") || empty("الدورات قيد الإعداد.", "تظهر الدورات عند نشرها من الإدارة.")}</div><p class="catalog-preview-note">${icon("lock")} استعراض العناوين والمدد متاح للجميع. تشغيل المعاينة يتطلب حسابًا مجانيًا، وبقية المحتوى المدفوع يفتحه الاشتراك.</p></div></section>`;
}
function stageComparison() {
  const c = storeConfig(db);
  return `<div class="stage-comparison"><article><span class="stage-index">01 / الأساس</span><h3>${icon("book")} التأسيس</h3><p>${e(c.foundation)}</p><span>لمن يبني الفكرة أو يعود لفهمها</span></article><article><span class="stage-index">02 / التطبيق</span><h3>${icon("target")} التدريب</h3><p>${e(c.training)}</p><span>لمن يريد تحويل الفهم إلى أداء</span></article></div>`;
}
export { stageComparison };
export function storeSectionsPage(id) {
  const s = visibleSections().find((s) => s.id === id);
  if (!id)
    return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], ["الأقسام"]])}<div class="catalog-intro"><span class="eyebrow">ابدأ باستكشاف اختبارك</span><h1>لكل طموح، مسار.</h1><p>تعرّف على المحتوى والمدرسين والدورات، واختر معاينة قبل الاشتراك.</p></div><div class="section-grid">${visibleSections().map(sectionCard).join("")}</div></div>`;
  if (!s)
    return empty(
      "القسم غير متاح",
      "يمكنك استعراض الأقسام المنشورة.",
      "book",
      btn("الأقسام", "#/sections"),
    );
  const tracks = (db.tracks || [])
      .filter((t) => t.visible && t.sectionId === id)
      .sort((a, b) => a.order - b.order),
    courses = visibleCourses().filter((c) => c.sectionId === id),
    teacherIds = new Set(courses.map((c) => c.instructorId));
  return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], ["الأقسام", "#/sections"], [s.title]])}<header class="catalog-intro catalog-intro-split"><div><span class="eyebrow">${e(s.label)}</span><h1>${e(s.title)}</h1><p>${e(s.description)}</p><div class="catalog-skill-tags">${s.subjects.map((v) => `<span>${e(v)}</span>`).join("")}</div></div><div class="catalog-section-symbol">${icon(s.icon)}</div></header>${s.status === "coming" ? `<div class="catalog-coming">${badge("قادم")}<h2>نجهّز المساحة لخطوتك القادمة.</h2><p>سيظهر مدرسو ${e(s.title)} ودوراته ومقاطعه بعد إطلاق محتواه. لا توجد معاينة أو دورة متاحة لهذا القسم حاليًا.</p>${btn("استكشف الأقسام المتاحة", "#/sections", "outline")}</div>` : `<section class="catalog-subsection"><h2>ماذا ستتعلم؟</h2><div class="catalog-track-grid">${tracks.map((t) => `<a href="#/track/${e(t.id)}"><span>${icon(t.id.includes("verbal") ? "book" : s.icon)}</span><h3>${e(t.title)}</h3><p>تأسيس وتدريب، ومدرسون ودورات وأسئلة مرتبطة بالمسار.</p><b>عن المسار ${icon("arrow")}</b></a>`).join("")}</div></section><section class="catalog-subsection"><h2>تأسيس أم تدريب؟ اعرف ما يناسب بدايتك.</h2>${stageComparison()}</section>${sourcesAndCourses(courses, teacherIds)}`}</div>`;
}
function sourcesAndCourses(courses, teacherIds) {
  const teachers = (db.instructors || []).filter(
    (t) => t.published && !t.deleted && teacherIds.has(t.id),
  );
  return `<section class="catalog-subsection"><div class="store-source-heading"><h2>المدرسون والمصادر المتاحة</h2><a class="text-link" href="#/instructors">كل المصادر ${icon("arrow")}</a></div>${teachers.length ? `<div class="store-teacher-grid">${teachers.map(publicTeacherCard).join("")}</div>` : '<p class="muted">لم تُنشر ملفات مدرسين مرتبطة بهذا المحتوى بعد.</p>'}</section><section class="catalog-subsection"><div class="store-source-heading"><h2>الدورات المتاحة</h2><span class="muted">${courses.length} دورات منشورة</span></div><div class="catalog-filter-row" role="group" aria-label="نوع الدورة">${[
    ["all", "الكل"],
    ["foundation", "التأسيس"],
    ["training", "التدريب"],
    ["review", "المراجعة"],
  ]
    .map(
      ([id, name]) =>
        `<button class="catalog-filter ${id === "all" ? "active" : ""}" data-store-stage="${id}" aria-pressed="${id === "all"}">${name}</button>`,
    )
    .join(
      "",
    )}</div><div class="catalog-course-grid" id="catalog-course-list">${courses.map(publicCourseCard).join("") || empty("لم تُنشر دورات في هذا المسار بعد.", "يمكنك استعراض المسارات الأخرى.")}</div><p id="catalog-filter-empty" class="muted hidden">لا توجد دورات منشورة في هذا النوع حاليًا.</p></section>`;
}
export function storeTrackPage(id) {
  const t = (db.tracks || []).find((t) => t.id === id && t.visible),
    s = db.sections.find((s) => s.id === t?.sectionId);
  if (!t || !s) return empty("المسار غير متاح", "استعرض الأقسام المنشورة.");
  const courses = visibleCourses().filter((c) => c.trackId === id);
  return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], [s.title, "#/section/" + s.id], [t.title]])}<div class="catalog-intro"><span class="eyebrow">${e(s.title)}</span><h1>${e(t.title)}</h1><p>${e(t.description || `تعلّم ${t.subject} من المفاهيم الأولى إلى التطبيق. استعرض المصادر والدورات، واختر مدرسًا مستقلًا للتأسيس وآخر للتدريب إن أردت.`)}</p></div>${stageComparison()}${sourcesAndCourses(courses, new Set(courses.map((c) => c.instructorId)))}</div>`;
}
export function storeTeachersPage(id) {
  const teachers = (db.instructors || []).filter(
      (t) => t.published && !t.deleted,
    ),
    teacher = teachers.find((t) => t.id === id);
  if (!id)
    return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], ["المدرسون"]])}<div class="catalog-intro"><span class="eyebrow">مصادر متعددة، لكل طريقة فهم</span><h1>تعرّف على من يشرح لك.</h1><p>ملفات المدرسين والمصادر ودوراتهم، كما تنشرها الإدارة.</p></div><label class="catalog-search">${icon("search")}<input id="store-teacher-search" type="search" aria-label="ابحث عن مدرس أو تخصص" placeholder="ابحث باسم المدرس أو التخصص"></label><div class="store-teacher-grid catalog-subsection" id="store-teacher-list">${teachers.map(publicTeacherCard).join("") || empty("المدرسون قيد الإضافة", "ستظهر ملفاتهم ودوراتهم بعد نشرها من الإدارة.")}</div><p class="muted hidden" id="store-teacher-empty">لا توجد نتائج مطابقة.</p></div>`;
  if (!teacher)
    return empty(
      "ملف المصدر غير منشور",
      "يمكنك التعرف على المصادر المتاحة.",
      "user",
      btn("المدرسون", "#/instructors"),
    );
  const courses = visibleCourses().filter((c) => c.instructorId === id),
    m = courses.map(courseMetrics),
    total = m.reduce((n, v) => n + v.seconds, 0);
  return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], ["المدرسون", "#/instructors"], [teacher.name]])}<header class="catalog-teacher-intro">${publicTeacherCard(teacher, { profile: true })}<div class="catalog-teacher-about"><span class="eyebrow">عن المصدر</span><p>${e(teacher.bio || "لم تُضف نبذة تعريفية بعد.")}</p><div class="catalog-skill-tags">${(
    teacher.sectionIds || []
  )
    .map((id) => db.sections.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => `<span>${e(s.title)}</span>`)
    .join(
      "",
    )}</div></div></header><div class="catalog-metrics"><div><b>${courses.length}</b><span>دورات منشورة</span></div><div><b>${m.reduce((n, v) => n + v.clips, 0)}</b><span>مقاطع فيديو</span></div><div><b dir="ltr">${total ? clipTime(total) : "—"}</b><span>مدة الفيديو المعروفة${m.some((v) => v.unknown) ? " · بعض المدد قيد الإضافة" : ""}</span></div></div><section class="catalog-subsection"><h2>دورات ${e(teacher.name)}</h2><div class="catalog-course-grid">${courses.map(publicCourseCard).join("") || empty("الدورات قيد الإعداد", "لم تُنشر دورات لهذا المصدر بعد.")}</div></section></div>`;
}
function previewPane(c, l) {
  if (!l) return "";
  const next = "/course/" + c.id + "?preview=" + l.id,
    can = canReadLesson(c, l, account.user, account.entitled),
    preview = isPreview(c, l);
  if (!account.user)
    return `<section id="course-preview" class="catalog-preview-gate"><span class="preview-gate-icon">${icon(preview ? "play" : "lock")}</span><span class="eyebrow">${preview ? "معاينة مجانية بحسابك" : "ضمن الاشتراك الشامل"}</span><h2>${e(l.title)}</h2><p>${preview ? "أنشئ حسابًا مجانيًا أو سجّل الدخول لتشاهد هذا المقطع. لا تحتاج اشتراكًا مدفوعًا للمعاينة." : "الاشتراك يفتح هذا المقطع وبقية محتوى الدورة. يمكنك تسجيل الدخول أو استعراض الباقات."}</p><div class="hero-actions">${btn(preview ? "إنشاء حساب مجاني" : "إنشاء حساب", authLink(true, next))}${btn("تسجيل الدخول", authLink(false, next), "outline")}</div><small>بعد الدخول نعيدك إلى هذه الدورة مباشرة.</small></section>`;
  if (!can || l.locked)
    return `<section id="course-preview" class="catalog-preview-gate">${icon("lock")}<h2>بقية الشرح، داخل رُزمتك.</h2><p>حسابك المجاني يتيح معاينة المقطع المحدد. الاشتراك الشامل يفتح بقية محتوى الدورة والمسارات.</p>${btn("شاهد الباقات", "#/pricing")}${previewLessonId(c) ? btn("العودة للمعاينة", "#/course/" + c.id + "?preview=" + previewLessonId(c), "outline") : ""}</section>`;
  const video = l.videoAssetId
    ? mediaUrl("/api/media/" + e(l.videoAssetId))
    : safeUrl(l.videoUrl);
  return `<section id="course-preview" class="catalog-preview-player"><div class="preview-player-heading"><div>${badge(preview ? "معاينة مجانية" : "محتوى متاح بحسابك", "badge-purple")}<h2>${e(l.title)}</h2></div><span dir="ltr">${l.durationSeconds ? clipTime(l.durationSeconds) : ""}</span></div>${video && (!l.videoStatus || l.videoStatus === "ready") ? `<video class="store-preview-video" controls playsinline preload="metadata" src="${video}" ${l.posterAssetId ? `poster="${mediaUrl("/api/media/" + e(l.posterAssetId))}"` : ""}></video>` : l.video ? '<div class="preview-processing">الفيديو غير جاهز للمشاهدة حاليًا. يمكنك العودة عند اكتمال تجهيزه.</div>' : `<div class="preview-reading"><p>${e(l.body || "لم يُضف محتوى لهذا الدرس بعد.")}</p>${l.example ? `<blockquote>${e(l.example)}</blockquote>` : ""}</div>`}<p id="preview-feedback" role="alert"></p>${l.fileAssetIds?.length ? `<div class="preview-files">${l.fileAssetIds.map((id, i) => `<a href="${mediaUrl("/api/media/" + e(id))}" target="_blank" rel="noopener noreferrer">${icon("file")}${e(l.attachmentNames?.[i] || "ملف الدرس " + (i + 1))}</a>`).join("")}</div>` : ""}${!account.entitled && c.access !== "free" ? `<div class="preview-upsell"><p>أعجبك أسلوب الشرح؟ الاشتراك يفتح بقية الدورة وكل المسارات.</p>${btn("اختر اشتراكك", "#/pricing", "outline")}</div>` : `<div class="preview-upsell">${btn("أكمل في منصة الطالب", "#/lesson/" + c.id + "/" + l.id, "outline")}</div>`}</section>`;
}
export function storeCoursePage(id, selected = null) {
  const c = visibleCourses().find((c) => c.id === id);
  if (!c)
    return empty(
      "الدورة غير متاحة",
      "استعرض المحتوى المنشور.",
      "book",
      btn("الأقسام", "#/sections"),
    );
  const m = courseMetrics(c),
    teacher = teacherFor(c),
    preview = previewLessonId(c),
    lessons = [...c.lessons]
      .filter((l) => l.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0)),
    active = lessons.find((l) => l.id === selected);
  return `<div class="store-catalog-page">${crumbs([["المتجر", "#/"], [db.sections.find((s) => s.id === c.sectionId)?.title || "الأقسام", "#/section/" + c.sectionId], [c.title]])}<header class="catalog-course-intro"><div><span class="eyebrow">${e(c.subject)} / ${stageLabel(c.stage)}</span><h1>${e(c.title)}</h1>${teacher ? `<a class="catalog-teacher" href="#/instructor/${teacher.id}">${icon("user")}${e(teacher.name)}</a>` : ""}<p>${e(c.description)}</p>${/نموذج|توضيح/.test(c.status || "") ? '<small class="catalog-demo">محتوى توضيحي مرفق بالمشروع، وليس دورة مكتملة.</small>' : ""}<div class="hero-actions">${preview ? btn("جرّب المعاينة المجانية", "#/course/" + c.id + "?preview=" + preview) : ""}${btn(account.entitled ? "إلى منصة الطالب" : "اشترك لفتح المحتوى", account.entitled ? "#/dashboard" : "#/pricing", preview ? "outline" : "primary")}</div><small>${preview ? "تشغيل المعاينة يتطلب تسجيل الدخول بحساب مجاني." : "لم تُتح معاينة لهذه الدورة حاليًا."}</small></div>${courseArt(c)}</header><div class="catalog-metrics"><div><b>${m.clips}</b><span>مقاطع فيديو${m.texts ? " · " + m.texts + " دروس نصية" : ""}</span></div><div><b dir="ltr">${m.seconds ? clipTime(m.seconds) : "—"}</b><span>${m.unknown ? "مدة معروفة · " + m.unknown + " مقاطع لم تُقَس بعد" : "إجمالي مدة الفيديو"}</span></div><div><b>${m.files}</b><span>ملفات ومرفقات مرتبطة</span></div></div>${previewPane(c, active)}<section class="catalog-subsection"><div class="store-source-heading"><div><h2>داخل هذه الدورة</h2><p>العناوين والمدد واضحة قبل الاشتراك.</p></div><span class="badge">${stageLabel(c.stage)}</span></div><div class="store-lesson-list">${
    lessons
      .map((l, i) => {
        const isFree = isPreview(c, l),
          allowed = canReadLesson(c, l, account.user, account.entitled);
        return `<a class="store-lesson-row ${isFree ? "is-preview" : ""} ${active?.id === l.id ? "is-selected" : ""}" href="#/course/${c.id}?preview=${l.id}"><span class="store-lesson-number">${String(i + 1).padStart(2, "0")}</span><div><h3>${e(l.title)}</h3><small>${isFree ? "المعاينة المجانية · تتطلب حسابًا" : c.access === "free" ? "متاح بحساب مجاني" : "ضمن الاشتراك الشامل"}${(l.attachmentCount ?? l.fileAssetIds?.length) ? " · " + (l.attachmentCount ?? l.fileAssetIds.length) + " مرفقات" : ""}</small>${l.attachmentNames?.length ? `<span class="lesson-file-titles">${l.attachmentNames.map(e).join(" · ")}</span>` : ""}</div><span class="store-lesson-time" ${l.durationSeconds ? 'dir="ltr"' : ""}>${l.durationSeconds ? clipTime(l.durationSeconds) : l.video || l.videoAssetId || l.videoUrl ? (l.estimatedMinutes ? l.estimatedMinutes + " دقائق تقديرية" : "المدة قيد الإضافة") : "درس نصي"}</span><span class="store-lesson-lock" aria-label="${isFree ? "معاينة مجانية" : allowed ? "متاح" : "مقفل"}">${icon(isFree ? "play" : allowed ? "book" : "lock")}</span></a>`;
      })
      .join("") || empty("لم تُضف دروس بعد.", "تظهر عناوينها ومددها عند النشر.")
  }</div><div class="catalog-course-assurance">${icon("lock")} ${c.access === "free" ? "هذه دورة مجانية بإعداد المالك، وتشغيل محتواها يتطلب حسابًا." : "المعاينة المحددة متاحة بعد التسجيل. بقية المقاطع والملفات المدفوعة تحتاج اشتراكًا نشطًا."}</div></section></div>`;
}
export function mountCatalog() {
  const click = (ev) => {
    const b = ev.target.closest("[data-store-stage]");
    if (!b) return;
    document.querySelectorAll("[data-store-stage]").forEach((x) => {
      x.classList.toggle("active", x === b);
      x.setAttribute("aria-pressed", String(x === b));
    });
    const cards = [
      ...document.querySelectorAll("#catalog-course-list .catalog-course"),
    ];
    for (const card of cards) {
      const id = card.querySelector("a").getAttribute("href").split("/")[2],
        course = db.courses.find((c) => c.id === id);
      card.hidden =
        b.dataset.storeStage !== "all" &&
        course?.stage !== b.dataset.storeStage;
    }
    document.querySelector("#catalog-filter-empty")?.classList.toggle(
      "hidden",
      cards.some((c) => !c.hidden),
    );
  };
  const input = (ev) => {
    if (ev.target.id !== "store-teacher-search") return;
    const query = ev.target.value.trim().toLocaleLowerCase("ar"),
      teachers = (db.instructors || []).filter(
        (t) =>
          t.published &&
          !t.deleted &&
          [t.name, t.specialty, t.bio]
            .join(" ")
            .toLocaleLowerCase("ar")
            .includes(query),
      );
    document.querySelector("#store-teacher-list").innerHTML = teachers
      .map(publicTeacherCard)
      .join("");
    document
      .querySelector("#store-teacher-empty")
      .classList.toggle("hidden", !!teachers.length);
  };
  const video = document.querySelector(".store-preview-video"),
    error = () => {
      const t = document.querySelector("#preview-feedback");
      if (t)
        t.textContent =
          "تعذر تشغيل الفيديو. تحقق من الاتصال وصلاحية حسابك، ثم أعد تحميل الدورة.";
    };
  video?.addEventListener("error", error);
  document.addEventListener("click", click);
  document.addEventListener("input", input);
  return () => {
    document.removeEventListener("click", click);
    document.removeEventListener("input", input);
    video?.removeEventListener("error", error);
  };
}

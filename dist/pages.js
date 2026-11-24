import { mediaUrl } from "./api.js";
import { storeSectionsPage, storeCoursePage } from "./store-catalog.js";
import { authLink, isPreview } from "./course-policy.js";
import { account } from "./api.js";
import { storefrontHome, subscriptionSection } from "./storefront.js";
import { authLive, tutorLive, reviewOrder } from "./live-pages.js";
import {
  db,
  student,
  visibleSections,
  visibleCourses,
  visibleQuestions,
  sectionName,
  money,
  allFeatures,
  escape as e,
  safeUrl,
} from "./data.js";
import {
  icon,
  btn,
  badge,
  pageHeading,
  empty,
  notice,
  courseCard,
  courseArt,
  sectionCard,
  priceCard,
} from "./ui.js";
export const tools = [
  [
    "bank",
    "layers",
    "بنك الأسئلة",
    "اختر موضوعًا محددًا، واعرف سبب صحة الإجابة بعد كل محاولة.",
  ],
  [
    "tests",
    "clock",
    "اختبارات محاكية",
    "تدرّب على إدارة الوقت، ثم راجع إجاباتك ونتيجتك الفعلية.",
  ],
  [
    "mistakes",
    "error",
    "دفتر الأخطاء",
    "اجمع الأسئلة التي تحتاج مراجعة، ثم عد إليها حتى تتقن فكرتها.",
  ],
  [
    "plan",
    "calendar",
    "خطة المذاكرة",
    "حوّل وقتك المتاح إلى مهام واضحة، وتابع ما أنجزته في حسابك.",
  ],
  [
    "progress",
    "chart",
    "متابعة التقدم",
    "تابع الدروس التي أكملتها واختباراتك والموضوعات التي تحتاج اهتمامًا.",
  ],
  [
    "scratch",
    "pen",
    "ورقة المسودة",
    "اكتب وارسم أثناء الحل بإصبعك أو قلمك، واحتفظ بصورة لأفكارك.",
  ],
];
export const toolsGrid = () =>
  `<div class="tools-grid">${tools.map(([id, ico, title, desc]) => `<a href="#/${id}" class="tool-item"><span>${icon(ico)}</span><div><h3>${title}</h3><p>${desc}</p></div></a>`).join("")}</div>`;
export const home = storefrontHome;
export const pricing = () =>
  `<div class="storefront">${subscriptionSection()}</div>`;
export function sectionsPage(id) {
  return storeSectionsPage(id);
}
export function coursePage(id, preview = null) {
  return storeCoursePage(id, preview);
}
export function questionCard(q, quiz = false) {
  const answered = !quiz && student.answers[q.id] !== undefined;
  return `<article class="question-card" data-question="${e(q.id)}"><div>${badge(sectionName(q.sectionId))} ${badge(q.subject)} ${badge(q.demo ? "سؤال توضيحي" : "تدريب مصنّف", "badge-purple")}</div><h3>${e(q.text)}</h3><div class="options">${q.options.map((o, i) => `<button class="option ${answered ? (i === q.correct ? "correct" : student.answers[q.id] === i ? "incorrect" : "") : ""}" data-${quiz ? "quiz-answer" : "answer"}="${q.id}" data-choice="${i}" ${answered ? "disabled" : ""}><span>${["أ", "ب", "ج", "د"][i]}</span>${e(o)}</button>`).join("")}</div>${answered ? `<div class="explanation" tabindex="-1"><strong>${student.answers[q.id] === q.correct ? "إجابة موفقة." : "فرصة نفهم فيها أكثر."}</strong><br>${e(q.explanation)}</div><button class="btn btn-ghost btn-sm" data-action="retry" data-id="${q.id}">أعد المحاولة ${icon("undo")}</button>` : ""}</article>`;
}
export function lessonPage(cid, lid) {
  const c = visibleCourses().find((c) => c.id === cid),
    l = c?.lessons.find((l) => l.id === lid);
  if (!l) return notFound();
  if (!account.user)
    return empty(
      isPreview(c, l) ? "المعاينة تبدأ بحساب مجاني." : "هذا المحتوى ضمن رُزمة.",
      "استعرض عناوين المقاطع ومددها قبل الاشتراك. تسجيل الدخول يعيدك إلى الدورة مباشرة.",
      "lock",
      btn(
        "تسجيل الدخول",
        authLink(false, "/course/" + c.id + "?preview=" + l.id),
      ) +
        btn(
          "إنشاء حساب مجاني",
          authLink(true, "/course/" + c.id + "?preview=" + l.id),
          "outline",
        ) +
        btn("شاهد الاشتراك", "#/pricing", "outline"),
    );
  if (l.locked)
    return empty(
      "هذا الدرس ضمن رُزمتك الشاملة.",
      "اشترك للوصول إلى محتوى الدرس والفيديو وأدوات المذاكرة.",
      "lock",
      btn("شاهد الاشتراك", "#/pricing"),
    );
  const q = db.questions.find((q) => q.id === l.questionId);
  const practiceIds = [
    ...new Set(
      [l.questionId, ...(l.practiceQuestionIds || [])].filter((id) =>
        db.questions.some((q) => q.id === id),
      ),
    ),
  ];
  const lessonTests = (db.tests || []).filter(
    (t) =>
      t.visible &&
      t.level === "lesson" &&
      t.courseId === c.id &&
      (!t.topicId || t.topicId === l.topicId),
  );
  return `<div class="breadcrumbs"><a href="#/course/${c.id}">${e(c.title)}</a>${icon("chevron")}<span>${e(l.title)}</span></div><div class="lesson-layout"><div class="panel lesson-content">${l.videoAssetId && l.videoStatus && l.videoStatus !== "ready" ? notice(l.videoStatus === "processing" ? "الفيديو قيد التجهيز بجودة 720p. يمكنك قراءة الدرس والعودة لاحقًا." : "الفيديو غير متاح حاليًا.", "clock") : l.videoAssetId ? `<video controls playsinline preload="metadata" src="${mediaUrl("/api/media/" + e(l.videoAssetId))}" class="lesson-video" ${l.posterAssetId ? `poster="${mediaUrl("/api/media/" + e(l.posterAssetId))}"` : ""}></video>` : l.videoUrl && safeUrl(l.videoUrl) ? `<video controls playsinline class="lesson-video" width="100%" preload="metadata" src="${safeUrl(l.videoUrl)}"></video>` : `<div class="video-empty"><div>${icon("book")}<h3>افهم الفكرة… من هنا</h3><p>درس نصي توضيحي · لم يُضف فيديو بعد</p></div></div>`}${badge(l.free ? "درس مجاني" : "درس للمشتركين", "badge-purple")}<h1 class="spaced">${e(l.title)}</h1><p>${e(l.body)}</p>${l.fileAssetIds?.length ? `<div class="stack spaced"><h3>ملفات الدرس</h3>${l.fileAssetIds.map((id, i) => `<a class="text-link" href="${mediaUrl("/api/media/" + e(id))}" target="_blank" rel="noopener noreferrer">${icon("file")} تحميل ملف الدرس ${i + 1}</a>`).join("")}</div>` : ""}${l.example ? `<div class="example-box"><h3>نفكّر فيها سوا</h3><p>${e(l.example)}</p></div>` : ""}<div id="lesson-study"></div>${practiceIds.length > 1 ? `<div class="spaced">${btn("أسئلة تطبيق هذا الدرس (" + practiceIds.length + ")", "#/bank?questions=" + encodeURIComponent(practiceIds.join(",")), "outline")}</div>` : ""}${lessonTests.length ? `<div class="stack spaced"><h2>قياس سريع — اختياري</h2>${lessonTests.map((t) => btn(e(t.title), "#/tests/" + t.id, "outline")).join("")}</div>` : ""}${q ? `<h2>جرّب فهمك</h2><div class="spaced">${questionCard(q)}</div>` : ""}<button class="btn btn-primary spaced" data-action="complete-lesson" data-course="${c.id}" data-id="${l.id}">${icon(student.completed.includes(l.id) ? "check" : "book")} ${student.completed.includes(l.id) ? "أكملت هذا الدرس" : l.videoAssetId || l.videoUrl ? "أكملت المشاهدة" : "أنهيت القراءة"}</button></div><aside class="panel"><h3>خطوتك التالية</h3><p>خذ وقتك في الفهم، ثم جرّب السؤال.</p><div class="stack spaced">${c.lessons.map((x) => `<a href="#/lesson/${c.id}/${x.id}" class="text-link">${icon(x.id === l.id ? "play" : "book")}${e(x.title)}</a>`).join("")}${btn("افتح المسودة", "#/scratch", "outline")}${btn("اسأل المدرس", "#/tutor", "light")}</div></aside></div>`;
}
// غلاف الطالب (الشريط العلوي والقائمة) يُبنى في student-shell.js ويلفّ الصفحة كاملة.
export function studentShell(content) {
  return `<div class="app-page">${content}</div>`;
}
export function taskList() {
  return student.tasks.length
    ? student.tasks
        .map(
          (t) =>
            `<div class="task-row ${t.done ? "done" : ""}"><input type="checkbox" id="task-${e(t.id)}" data-task="${e(t.id)}" ${t.done ? "checked" : ""}><label for="task-${e(t.id)}">${e(t.text)}</label><button class="icon-btn" data-action="delete-task" data-id="${e(t.id)}" aria-label="حذف المهمة">${icon("trash")}</button></div>`,
        )
        .join("")
    : '<p class="muted spaced">لا توجد مهام بعد. اختر خطوة صغيرة تبدأ بها اليوم.</p>';
}
const taskForm = () =>
  `<form id="task-form" class="inline-form"><input name="task" aria-label="مهمة مذاكرة جديدة" placeholder="مثل: مراجعة النسب والتناسب" maxlength="120" required><button class="btn btn-primary" type="submit">${icon("plus")} أضف</button></form>`;
export function dashboard() {
  const lessons = visibleCourses().reduce((a, c) => a + c.lessons.length, 0),
    done = visibleCourses()
      .flatMap((c) => c.lessons)
      .filter((l) => student.completed.includes(l.id)).length;
  let percent = lessons ? Math.round((done / lessons) * 100) : 0;
  const last = student.lastLesson;
  return studentShell(
    `${pageHeading("كل خطوة تقرّبك", `أهلًا ${e(student.name || "بطموحك")} ✦`, "هذه مساحتك. تقدمك ومهامك محفوظة في حسابك.")}${notice("الأرقام هنا تأتي من الدروس التي أكملتها والاختبارات التي أنهيتها في حسابك.")}<div class="stats"><div class="stat"><span>مستوى الإنجاز</span><b>${percent}%</b><small>${done} من ${lessons} دروس توضيحية</small><div class="progress-track"><span style="width:${percent}%"></span></div></div><div class="stat"><span>اختبارات أكملتها</span><b>${student.attempts.length}</b><small>من اختباراتك المكتملة</small></div><div class="stat"><span>الاشتراك المتبقي</span><b>${student.subscription ? Math.max(0, Math.ceil((Date.parse(student.subscription.end_at) - Date.now()) / 86400000)) : 0}</b><small>أيام متبقية في الاشتراك</small></div></div><div class="grid-two"><div class="panel"><h2>كمّل من حيث وصلت</h2>${last ? `<p>${e(last.title)}</p><div class="spaced">${btn("متابعة الدرس", `#/lesson/${last.course}/${last.id}`)}</div>` : `<p>رحلتك تبدأ بدرس واحد.</p><div class="spaced">${btn("اكتشف أول درس", "#/sections", "outline")}</div>`}</div><div class="panel"><h2>خطة اليوم</h2>${taskList()}${taskForm()}</div><div class="panel"><h2>آخر الاختبارات</h2>${
      student.attempts.length
        ? student.attempts
            .slice(-3)
            .reverse()
            .map(
              (a) =>
                `<a href="#/results/${a.id}" class="list-row"><span>اختبار توضيحي</span><strong>${a.correct} / ${a.total}</strong></a>`,
            )
            .join("")
        : "<p>لا توجد اختبارات مكتملة حتى الآن.</p>"
    }<a href="#/tests" class="text-link spaced">جرّب اختبارًا ${icon("arrow")}</a></div><div class="panel"><h2>نقاط تحتاج مراجعة</h2>${weaknesses()}<a href="#/mistakes" class="text-link spaced">دفتر أخطائي ${icon("arrow")}</a></div></div>`,
    "dashboard",
  );
}
function weaknesses() {
  const wrong = student.mistakes
    .map((id) => db.questions.find((q) => q.id === id))
    .filter(Boolean);
  const subjects = [...new Set(wrong.map((q) => q.subject))];
  return subjects.length
    ? subjects
        .map(
          (s) =>
            `<div class="list-row"><span>${e(s)}</span><small>${wrong.filter((q) => q.subject === s).length} سؤال للمراجعة</small></div>`,
        )
        .join("")
    : "<p>تظهر هنا الموضوعات التي أخطأت فيها بعد التدريب. لا توجد بيانات كافية للتحليل الآن.</p>";
}
export function planPage() {
  return studentShell(
    `${pageHeading("على مهل، وباستمرار", "خطتك. على مقاس يومك.", "رتّب مهامك، وأنجز خطوة بعد خطوة. المهام محفوظة في حسابك.")}<div class="panel"><h2>خطواتي القادمة</h2><div id="tasks">${taskList()}</div>${taskForm()}</div>`,
    "plan",
  );
}
export function progressPage() {
  return studentShell(
    `${pageHeading("أثر جهدك", "كل خطوة محسوبة.", "هذه المتابعة تعكس نشاط حسابك، ولا تمثّل تقييمًا رسميًا لدرجة اختبارك.")}<div class="grid-two"><div class="panel"><h2>تقدم الدروس</h2>${visibleCourses()
      .map((c) => {
        const n = c.lessons.filter((l) =>
          student.completed.includes(l.id),
        ).length;
        return `<div class="list-row"><span>${e(c.title)}</span><b>${n} / ${c.lessons.length}</b></div>`;
      })
      .join(
        "",
      )}</div><div class="panel"><h2>موضوعات للمراجعة</h2>${weaknesses()}</div></div><div class="panel spaced"><h2>سجل الاختبارات</h2>${student.attempts.length ? student.attempts.map((a) => `<a href="#/results/${a.id}" class="list-row"><span>${new Date(a.date).toLocaleDateString("ar-SA")}</span><strong>${a.correct} / ${a.total} ${icon("arrow")}</strong></a>`).join("") : "<p>أكمل اختبارك الأول ليبدأ سجلّك هنا.</p>"}</div>`,
    "progress",
  );
}
export function bankPage() {
  return studentShell(
    `${pageHeading("الفهم يتقوّى بالتجربة", "سؤال يفتح لك فكرة.", "أسئلة مصنّفة حسب القسم والمادة. تُحفظ الإجابات في حسابك، وتنتقل الأخطاء إلى دفترك.")}<div class="filters"><div class="search-box">${icon("search")}<input id="question-search" type="search" aria-label="بحث في الأسئلة" placeholder="ابحث عن فكرة أو سؤال…"></div><select id="question-section" aria-label="تصفية حسب القسم"><option value="all">كل الأقسام</option>${visibleSections()
      .filter((s) => s.status !== "coming")
      .map((s) => `<option value="${s.id}">${e(s.title)}</option>`)
      .join(
        "",
      )}</select><select id="question-subject" aria-label="تصفية حسب المادة"><option value="all">كل المواد</option>${[...new Set(db.questions.map((q) => q.subject))].map((s) => `<option>${e(s)}</option>`).join("")}</select></div><div id="question-list">${
      visibleQuestions()
        .map((q) => questionCard(q))
        .join("") ||
      empty("لا توجد أسئلة بعد", "تُضاف الأسئلة من لوحة الإدارة.")
    }</div>`,
    "bank",
  );
}
export function mistakesPage() {
  const questions = student.mistakes
    .map((id) => db.questions.find((q) => q.id === id))
    .filter(Boolean);
  return studentShell(
    `${pageHeading("من الخطأ، تبدأ الفكرة", "دفترك… لفهم أعمق.", "أعد محاولة السؤال، ثم أزله من الدفتر عندما تشعر أنك أتقنته.")}<div>${questions.length ? questions.map((q) => `<div>${questionCard(q)}<button class="btn btn-outline btn-sm" data-action="remove-mistake" data-id="${q.id}">أتقنت الفكرة — أزل من الدفتر ${icon("check")}</button><div class="spaced"></div></div>`).join("") : empty("صفحة جديدة، وفهم جديد.", "عندما تخطئ في سؤال تدريبي، سيُضاف هنا لتعود إليه بوقتك.", "error", btn("اذهب لبنك الأسئلة", "#/bank", "outline"))}</div>`,
    "mistakes",
  );
}
export function testsPage(id) {
  return studentShell(
    `${pageHeading("تدرّب على لحظة الاختبار", "اختبر فهمك. وراجع خطوتك.", "اختر اختبارًا، والتصحيح والنتيجة يُحسبان على الخادم.")}<div class="stack">${
      (db.tests || [])
        .filter((t) => t.visible && (!id || t.id === id))
        .map(
          (t) =>
            `<article class="panel"><span class="badge badge-purple">${t.demo ? "اختبار توضيحي — ليس اختبارًا رسميًا" : t.access === "free" ? "اختبار مجاني" : "للمشتركين"}</span><h2 class="spaced">${e(t.title)}</h2><p>${t.count ?? t.questionIds?.length ?? 0} أسئلة · ${Math.ceil(t.duration / 60)} دقائق · ${t.points} درجة للسؤال</p><button class="btn btn-primary spaced" data-action="start-quiz" data-test="${e(t.id)}">${t.locked ? "الاشتراك للوصول" : "ابدأ الاختبار"} ${icon("arrow")}</button></article>`,
        )
        .join("") ||
      empty("الاختبارات قيد الإعداد", "ستظهر هنا الاختبارات عند نشرها.")
    }</div>`,
    "tests",
  );
}
export function resultsPage(id) {
  const a =
    student.attempts.find((a) => a.id === id) || student.attempts.at(-1);
  if (!a)
    return studentShell(
      empty(
        "نتيجتك تنتظرك",
        "لم تكمل اختبارًا بعد. جرّب الاختبار التوضيحي لتشاهد نتيجة فعلية.",
        "chart",
        btn("ابدأ اختبارًا", "#/tests"),
      ),
      "tests",
    );
  return studentShell(
    `${pageHeading("وقفة للفهم", "كل تجربة تعلّمك شيئًا.", "نتيجة الاختبار التوضيحي، من إجاباتك الفعلية.")}<div class="panel result-score"><div class="score-ring">${Math.round((a.correct / a.total) * 100)}%</div><h2>${a.correct} إجابات صحيحة من ${a.total}</h2><p>الوقت المستخدم: ${a.elapsed} ثانية · ${new Date(a.date).toLocaleDateString("ar-SA")}</p><div class="spaced">${btn("راجع دفتر الأخطاء", "#/mistakes", "outline")} ${btn("جرّب من جديد", "#/tests")}</div></div><div class="stack spaced">${a.review.map((r) => `<div class="panel"><h3>${e(r.text)}</h3><p>إجابتك: ${e(r.choice === null ? "لم تُجب" : r.options[r.choice])}</p><p><strong>الإجابة الصحيحة: ${e(r.options[r.correct])}</strong></p><div class="explanation">${e(r.explanation)}</div></div>`).join("")}</div>`,
    "tests",
  );
}
export function scratchPage() {
  return studentShell(
    `${pageHeading("مساحة للأفكار", "جرّب. ارسم. فكّر بصوت قلمك.", "ورقة مسودة بسيطة بإصبعك أو قلمك أو الماوس. ليست سبورة ذكاء اصطناعي.")}<div class="canvas-wrap"><div class="drawing-toolbar"><div><label for="pen-color">اللون</label><input id="pen-color" type="color" value="#54418b"><label for="pen-size">السُمك</label><input id="pen-size" type="range" min="1" max="16" value="3"></div><div><button class="icon-btn" data-draw="undo" aria-label="تراجع عن آخر خط">${icon("undo")}</button><button class="btn btn-outline btn-sm" data-draw="clear">${icon("trash")} مسح</button><button class="btn btn-primary btn-sm" data-draw="download">${icon("download")} حفظ صورة</button></div></div><div class="canvas-area"><canvas id="scratch-canvas" aria-label="مسودة للرسم والكتابة اليدوية">يمكنك استخدام لوحة المفاتيح مع أدوات المذاكرة الأخرى. المسودة مخصصة للإدخال بالقلم أو المؤشر.</canvas></div></div><p class="canvas-note">تُحفظ الخطوط في حسابك عند تسجيل الدخول؛ وللزائر على هذا المتصفح. استخدم «حفظ صورة» للاحتفاظ بنسخة.</p>`,
    "scratch",
  );
}
export const tutorPage = tutorLive;
export const authPage = authLive;
export const subscriptionPage = reviewOrder;
export function aboutPage() {
  return `${pageHeading("عن رُزمة", "طموحك يستاهل استعدادًا أوضح.", "منصة عربية تجمع مسارات القدرات والتحصيلي، وSTEP عند إطلاقه، في تجربة مذاكرة واحدة.")}<div class="panel info-prose"><h2>من الفهم إلى التقدّم</h2><p>مسارات مرتّبة ودروس وتدريبات، مع دفتر أخطاء وخطة مذاكرة وورقة مسودة. حسابك يحتفظ بخطواتك لتعود إليها في الوقت الذي يناسبك.</p><h2>اشتراك واحد لكل المسارات</h2><p>المدد تختلف، والمميزات واحدة. لا يوجد تجديد تلقائي دون موافقة صريحة، ولا يُفعّل الاشتراك إلا بعد تأكيد الدفع.</p><h2>وضوح في المحتوى</h2><p>المواد الموسومة «نموذج توضيحي» أمثلة لتجربة التعلم، وليست مكتبة الدورات النهائية أو اختبارات رسمية. لا نعرض تقييمات أو أعداد طلاب مختلقة.</p><h2>المدرس الذكي</h2><p>يعمل بعد تفعيل الخدمة من المالك، بحدود استخدام يومية. قد تخطئ الاستجابات؛ راجع المراجع المعتمدة وتحقق من الحل.</p><h2>الدعم</h2><p>سيُضاف بريد الدعم الرسمي عند اعتماده من مالك رُزمة.</p></div>`;
}
export function notFound() {
  return empty(
    "هذه الصفحة أخذت مسارًا آخر.",
    "قد يكون الرابط غير صحيح أو المحتوى مخفيًا. ارجع للمسارات لتكمل رحلتك.",
    "search",
    btn("استكشف الأقسام", "#/sections"),
  );
}

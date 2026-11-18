import { api, account } from "./api.js";
import { db, escape as e, safeUrl } from "./data.js";
import { icon, btn, notice, empty, pageHeading } from "./ui.js";
import { studentShell } from "./pages.js";
export const stageName = (s) =>
  ({ foundation: "التأسيس", training: "التدريب", review: "المراجعة" })[s] || s;
const minutes = (n) => Math.ceil((n || 0) / 60),
  dayLabel = (d) =>
    new Date(d + "T12:00Z").toLocaleDateString("ar-SA", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
const weekdays = [
  "الأحد",
  "الإثنين",
  "الثلاثاء",
  "الأربعاء",
  "الخميس",
  "الجمعة",
  "السبت",
];
export function learningPage(kind) {
  const title =
    {
      welcome: "خطة تبدأ بمعرفتك.",
      choose: "مدرّسك لكل مرحلة، باختيارك.",
      instructors: "خبرات متعددة. وخيار يناسبك.",
      instructor: "تعرّف على المصدر",
      track: "مسارك، من الفهم إلى التطبيق.",
      discover: "اكتشف نقطة بدايتك.",
      settings: "وقتي ومذاكرتي",
    }[kind] || "رحلتك في رُزمة";
  const loading = `<div id="learning-root" aria-live="polite"><div class="dash-skeleton"><span></span><span></span><span></span></div></div>`;
  if (kind === "journey") return studentShell(loading, "journey");
  const body = `${pageHeading(kind === "settings" ? "إعدادات" : "رحلة مذاكرة على مقاسك", title)}${loading}`;
  return ["settings"].includes(kind) ? studentShell(body, "journey") : body;
}
export function teacherCard(t) {
  const image = t.imageAssetId
    ? "/api/media/" + e(t.imageAssetId)
    : safeUrl(t.imageUrl);
  return `<a href="#/instructor/${e(t.id)}" class="teacher-card"><div class="teacher-portrait">${image ? `<img src="${image}" alt="${e(t.name)}" loading="lazy">` : `<span aria-hidden="true">${e(t.name.slice(0, 1))}</span>`}</div><div><span class="badge">${t.kind === "source" ? "مصدر تعليمي" : "مدرّس"}</span><h3>${e(t.name)}</h3><p>${e(t.specialty)}</p><small>${t.courseIds.length} دورات منشورة · ${t.videoCount} مقاطع${t.videoSeconds ? ` · ${minutes(t.videoSeconds)} دقيقة فيديو معروفة` : ""}</small></div>${icon("arrow")}</a>`;
}
const field = (name, label, value = "", type = "text", extra = "") =>
  `<div class="field"><label for="l-${name}">${label}</label><input id="l-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${extra}></div>`;
const daysInputs = (days) =>
  `<div class="study-days">${weekdays.map((d, i) => `<label><input name="studyDays" value="${i}" type="checkbox" ${days?.includes(i) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div>`;
const consent = (p) =>
  `<label class="checkbox learning-consent"><input name="aiContextConsent" type="checkbox" ${p.aiContextConsent ? "checked" : ""}><span>أسمح للمدرس الذكي بالاطلاع على اختياراتي التعليمية وخطتي وأخطائي ونتائج اختباراتي المسجلة لمساعدتي. يمكن تغيير ذلك لاحقًا.</span></label>`;
export function mountLearning(kind, id, toast, rerender) {
  let disposed = false,
    catalog,
    me,
    progress,
    step = 0,
    chosen = new Set(),
    extraLimit = 6,
    dayLimit = 14,
    sessionId = null,
    timer = null,
    ping = null,
    started = 0;
  const target = document.querySelector("#learning-root");
  const error = (err) => {
    if (!disposed) toast(err.message);
  };
  async function load() {
    try {
      catalog = await api("/api/learning/catalog");
      if (disposed) return;
      if (account.user) {
        me = await api("/api/learning/me");
        if (disposed) return;
        chosen = new Set(me.selectedCourseIds);
      }
      if (kind === "welcome") {
        step = me.profile.onboardingCompleted
          ? 0
          : Number(me.profile.onboardingStep) || 0;
        drawWizard();
      }
      if (kind === "choose") drawChoices();
      if (kind === "journey") {
        progress = await api("/api/learning/progress");
        if (!disposed) drawJourney();
      }
      if (kind === "settings") drawSettings();
      if (kind === "instructors") await listTeachers();
      if (kind === "instructor") await drawTeacher();
      if (kind === "track") drawTrack();
      if (kind === "discover") drawDiscover();
    } catch (err) {
      if (!disposed)
        target.innerHTML = empty(
          "تعذر تحميل هذا الجزء",
          e(err.message),
          "error",
        );
      error(err);
    }
  }
  function option(name, value, label, checked) {
    return `<label class="welcome-choice"><input type="radio" name="${name}" value="${e(value)}" ${checked ? "checked" : ""}><span>${label}</span>${icon("check")}</label>`;
  }
  function drawWizard() {
    const p = me.profile;
    const questions = [
      [
        "sectionId",
        "ما الاختبار الذي تستعد له؟",
        catalog.sections
          .map((s) =>
            option(
              "sectionId",
              s.id,
              e(s.title) + (s.status === "coming" ? " — المحتوى قادم" : ""),
              p.sectionId === s.id,
            ),
          )
          .join(""),
      ],
      [
        "foundationStarted",
        "هل بدأت التأسيس؟",
        [
          ["true", "بدأت وأريد أكمل"],
          ["false", "لم أبدأ بعد"],
        ]
          .map(([v, t]) =>
            option(
              "foundationStarted",
              v,
              t,
              String(p.foundationStarted) === v,
            ),
          )
          .join(""),
      ],
      [
        "foundationCompleted",
        "هل أنهيت مرحلة التأسيس؟",
        [
          ["true", "نعم، وأحتاج تدريبًا ومراجعة"],
          ["false", "لا، ما زلت أبني الأساس"],
        ]
          .map(([v, t]) =>
            option(
              "foundationCompleted",
              v,
              t,
              String(p.foundationCompleted) === v,
            ),
          )
          .join(""),
      ],
      [
        "selfLevel",
        "كيف تقيّم مستواك؟",
        [
          ["beginner", "أبدأ من المفاهيم الأولى"],
          ["intermediate", "أفهم الأساس وأحتاج تدريبًا"],
          ["advanced", "أحتاج قياسًا ومراجعة مركّزة"],
          ["unknown", "أفضل أن أكتشفه بالاختبارات"],
        ]
          .map(([v, t]) => option("selfLevel", v, t, p.selfLevel === v))
          .join(""),
      ],
      [
        "targetScore",
        "ما الدرجة التي تطمح إليها؟",
        field(
          "targetScore",
          "درجتك المستهدفة",
          p.targetScore,
          "number",
          'min="0" max="100" step="1"',
        ),
      ],
      [
        "examDate",
        "متى موعد اختبارك؟",
        field("examDate", "موعد الاختبار", p.examDate, "date"),
      ],
      [
        "dailyMinutes",
        "كم وقت تقدر تخصص للمذاكرة يوميًا؟",
        field(
          "hours",
          "عدد الساعات",
          p.dailyMinutes ? p.dailyMinutes / 60 : "",
          "number",
          'min="0.25" max="12" step="0.25"',
        ) +
          '<p class="muted">نحسب المقاطع حسب مددها، ونضيف وقتًا للحل والمراجعة والراحة.</p>',
      ],
      [
        "studyDays",
        "ما الأيام المناسبة لك؟",
        daysInputs(p.studyDays) + consent(p),
      ],
    ];
    step = Math.max(0, Math.min(7, step));
    const [key, title, body] = questions[step];
    target.innerHTML = `<div class="welcome-layout"><aside><span class="eyebrow">نرتّب البداية، ثم تختار بنفسك</span><h2>وقتك مختلف.<br>ورحلتك تستحق<br>خطة تناسبه.</h2><p>سؤال واحد في كل خطوة. تقدر تتخطى السؤال وتكمل بياناتك لاحقًا.</p><div class="welcome-step-indicator">${step + 1}<small> / ٨</small></div><div class="progress-track"><span style="width:${((step + 1) / 8) * 100}%"></span></div><small>تقييمك الذاتي لا يُعتبر نتيجة اختبار أو دليل إتقان.</small></aside><form id="welcome-form" class="panel" data-key="${key}"><span class="eyebrow">خطوتك ${step + 1} من ٨</span><h2>${title}</h2><div class="welcome-answers">${body}</div><div id="learning-form-error" class="form-error" role="alert"></div><div class="welcome-actions"><button type="button" class="btn btn-outline" data-welcome-back ${step === 0 ? "disabled" : ""}>السابق</button><button type="button" class="btn btn-ghost" data-welcome-skip>تخطي</button><button type="submit" class="btn btn-primary">${step === 7 ? "إلى اختيار الدورات" : "التالي"} ${icon("arrow")}</button></div></form></div>`;
  }
  async function advance(skip = false) {
    const form = document.querySelector("#welcome-form"),
      key = form.dataset.key,
      fd = new FormData(form),
      input = { onboardingStep: Math.min(7, step + 1) };
    if (!skip) {
      if (!form.reportValidity()) return;
      const value = fd.get(key);
      if (["foundationStarted", "foundationCompleted"].includes(key)) {
        if (value !== null) input[key] = value === "true";
      } else if (key === "dailyMinutes") {
        const hours = fd.get("hours");
        input.dailyMinutes = hours ? Math.round(Number(hours) * 60) : null;
      } else if (key === "studyDays") {
        input.studyDays = fd.getAll("studyDays").map(Number);
        input.aiContextConsent = fd.has("aiContextConsent");
      } else if (key === "targetScore")
        input.targetScore = value ? Number(value) : null;
      else if (key === "sectionId" || key === "examDate")
        input[key] = value || null;
      else if (value !== null) input[key] = value;
    }
    if (step === 7) input.onboardingCompleted = true;
    const result = await api("/api/learning/profile", {
      method: "PUT",
      body: input,
    });
    me.profile = result.profile;
    if (step === 7) location.hash = "#/choose";
    else {
      step++;
      drawWizard();
    }
  }
  function courseChoice(c) {
    const teacher = catalog.instructors.find((t) => t.id === c.instructorId),
      m = c.metrics;
    return `<label class="course-choice"><input type="checkbox" name="courseId" value="${e(c.id)}" ${chosen.has(c.id) ? "checked" : ""}><span class="course-choice-body"><small>${teacher ? e(teacher.name) : c.instructorId ? "مصدر مؤرشف، والاختيار السابق محفوظ" : "دورة مستقلة — المصدر غير محدد"}</small><b>${e(c.title)}</b><p>${e(c.description)}</p><span class="choice-metrics">${m.videoCount} مقاطع فيديو · ${m.lessonCount - m.videoCount} دروس نصية${m.videoSeconds ? ` · ${minutes(m.videoSeconds)} دقيقة فيديو معروفة` : ""}${m.estimatedSeconds ? ` · ${minutes(m.estimatedSeconds)} دقيقة تقديرية للمحتوى` : ""}</span>${m.unknownVideoCount ? `<em>${m.unknownVideoCount} مقاطع لم تُستخرج مدتها بعد</em>` : ""}<span class="choice-links"><a href="#/course/${c.id}">عرض المحتوى ${icon("arrow")}</a>${teacher ? `<a href="#/instructor/${teacher.id}">عن المدرّس</a>` : ""}</span></span>${icon("check")}</label>`;
  }
  function drawChoices() {
    const section = me.profile.sectionId,
      teacher = document.querySelector("#choice-teacher")?.value || "all";
    const tracks = catalog.tracks.filter(
      (t) => t.visible && (!section || t.sectionId === section),
    );
    target.innerHTML = `${notice("اختر مدرسًا أو مصدرًا مستقلًا لكل مرحلة. يمكنك اختيار أكثر من دورة، أو ترك أي مسار لتكمله لاحقًا. اختيار الدورة لا يتجاوز صلاحيات الاشتراك.")}<div class="choice-toolbar"><div><h2>المحتوى الذي تختاره، هو أساس خطتك.</h2><p>مدد الفيديو معروفة من ملفاتها، وأوقات الحل والمراجعة تقديرات قابلة للتعديل.</p></div><label>تصفية حسب المصدر<select id="choice-teacher"><option value="all">جميع المدرسين والمصادر</option>${catalog.instructors.map((t) => `<option value="${t.id}" ${teacher === t.id ? "selected" : ""}>${e(t.name)}</option>`).join("")}<option value="independent" ${teacher === "independent" ? "selected" : ""}>الدورات المستقلة</option></select></label></div><form id="choices-form">${(me.unavailableCourseChoices || []).length ? `<fieldset class="choice-lane"><legend>اختيارات سابقة غير متاحة حاليًا</legend><p class="muted">تبقى اختياراتك وتقدمك محفوظة عند إخفاء المحتوى. يمكنك إلغاء الاختيار أو الاحتفاظ به حتى يعود.</p>${me.unavailableCourseChoices.map((c) => `<label class="checkbox"><input type="checkbox" name="courseId" value="${e(c.id)}" ${chosen.has(c.id) ? "checked" : ""}><span>${e(c.title)}</span></label>`).join("")}</fieldset>` : ""}${tracks
      .map(
        (t) =>
          `<section class="choice-track"><div class="admin-bar"><h2>${e(t.title)}</h2><a class="text-link" href="#/track/${t.id}">عن المسار ${icon("arrow")}</a></div>${
            t.coming
              ? empty(
                  "المحتوى قادم",
                  "تقدر تختار مسارًا آخر الآن وتعود عند إطلاقه.",
                  "language",
                )
              : ["foundation", "training", "review"]
                  .map((stage) => {
                    const courses = catalog.courses.filter(
                      (c) =>
                        c.trackId === t.id &&
                        c.stage === stage &&
                        (!c.instructorId ||
                          catalog.instructors.some(
                            (t) => t.id === c.instructorId,
                          ) ||
                          chosen.has(c.id)) &&
                        (teacher === "all" ||
                          (teacher === "independent" && !c.instructorId) ||
                          c.instructorId === teacher),
                    );
                    if (stage === "review" && !courses.length) return "";
                    return `<fieldset class="choice-lane"><legend>${stageName(stage)}</legend><div class="course-choices">${courses.map(courseChoice).join("") || '<p class="muted">لم تُنشر دورات في هذه المرحلة أو لهذا المصدر بعد. يمكنك تخطيها.</p>'}</div></fieldset>`;
                  })
                  .join("")
          }</section>`,
      )
      .join(
        "",
      )}<div id="learning-form-error" role="alert" class="form-error"></div><div class="choice-save-bar"><span id="selection-count">${chosen.size} دورات مختارة</span><a class="btn btn-outline" href="#/journey">أكمل الاختيار لاحقًا</a><button type="submit" class="btn btn-primary">احفظ اختياراتي واحسب خطتي ${icon("calendar")}</button></div></form>`;
  }
  function taskLink(t) {
    const s = t.source;
    if (t.kind === "watch" || t.kind === "read")
      return `#/lesson/${t.course_id}/${t.lesson_id}?start=${Math.floor(s.start || 0)}&task=${t.id}`;
    if (t.kind === "test") return "#/tests/" + s.testId;
    if (t.kind === "practice")
      return (
        "#/bank?track=" +
        encodeURIComponent(t.track_id || "") +
        (s.questionIds?.[0]
          ? "&questions=" + encodeURIComponent(s.questionIds.join(","))
          : "")
      );
    if (t.kind === "review")
      return s.review === "mistakes" ? "#/mistakes" : "#/sections";
    return null;
  }
  function taskCard(t) {
    const done = t.status === "completed",
      labels = {
        watch: "مشاهدة",
        read: "قراءة",
        practice: t.source.offline ? "تدريب ذاتي" : "أسئلة",
        test: "اختبار",
        review: "مراجعة",
        break: "راحة",
      },
      link = taskLink(t),
      track =
        t.track_id && t.track_id !== "review" && t.track_id !== "break"
          ? catalog.tracks.find((x) => x.id === t.track_id)?.title
          : "";
    const canComplete =
      !done && !t.source.unknown && t.kind !== "test" && t.kind !== "break";
    return `<article class="task-item ${done ? "is-done" : ""} kind-${t.kind}"><span class="task-ico">${icon(done ? "check" : t.kind === "watch" ? "play" : t.kind === "test" ? "clock" : t.kind === "break" ? "sun" : t.kind === "practice" ? "target" : "book")}</span><div class="task-body"><h3>${e(t.title)}</h3><small>${labels[t.kind]}${track ? " · " + e(track) : ""}${t.source.unknown ? "" : " · " + minutes(t.seconds) + " دقيقة" + (t.source.estimated ? " تقديرية" : "")}</small>${t.source.segmented ? `<small class="task-note">من الدقيقة ${minutes(t.source.start)} إلى ${minutes(t.source.end)}</small>` : ""}${t.source.unknown ? '<small class="task-note">تظهر المدة بعد استخراجها من الفيديو</small>' : ""}</div><div class="task-actions">${link ? `<a class="task-open" href="${link}" aria-label="${done ? "مراجعة" : "افتح"}: ${e(t.title)}">${done ? "مراجعة" : "افتح"}</a>` : ""}${canComplete ? `<button class="task-check" data-journey-complete="${t.id}" aria-label="تم: ${e(t.title)}" title="${t.kind === "watch" ? "أكملت هذا الجزء" : t.kind === "read" ? "أنهيت القراءة" : "أنجزت المهمة"}">${icon("check")}</button>` : t.kind === "test" && !done ? '<small class="task-note">تُحتسب بعد إنهاء الاختبار</small>' : ""}</div></article>`;
  }
  function drawJourney() {
    const p = progress,
      plan = p.plan,
      day = p.today.date,
      all = plan.tasks.filter(
        (t) => !t.course_id || p.selection.includes(t.course_id),
      ),
      dayTasks = all.filter((t) => t.scheduled_date === day),
      extra = all.filter(
        (t) =>
          t.status === "pending" &&
          t.kind !== "break" &&
          !t.source.unknown &&
          t.scheduled_date !== day &&
          t.source.level !== "weekly",
      ),
      dates = [
        ...new Set(
          all.filter((t) => t.scheduled_date).map((t) => t.scheduled_date),
        ),
      ].sort(),
      pendingToday = dayTasks.filter(
        (t) => t.status !== "completed" && t.kind !== "break",
      ),
      next = pendingToday.find((t) => taskLink(t)) || extra.find((t) => taskLink(t)),
      nextLink = next ? taskLink(next) : null,
      pct = (v) => (v === null || v === undefined ? "—" : v + "٪"),
      ring = (v) =>
        `<span class="ring" style="--p:${Number(v) || 0}"><b>${v === null || v === undefined ? "—" : v}</b></span>`;
    const heroTitle = !dayTasks.filter((t) => t.kind !== "break").length
      ? "يومك فاضي. استثمره."
      : pendingToday.length
        ? `باقي لك ${pendingToday.length} ${pendingToday.length === 1 ? "مهمة" : "مهام"} اليوم`
        : "أنجزت مهام اليوم. أحسنت.";
    const upcoming = dates.filter((d) => d > day);
    target.innerHTML = `<div class="dash">
<section class="dash-hero"><div class="dash-hero-main"><span class="dash-eyebrow">أهلًا ${e(account.user.name)} ✦</span><h1>${heroTitle}</h1><div class="dash-chips"><span>${icon("calendar")} ${dayLabel(day)}</span>${p.daysToExam === null ? `<a href="#/learning-settings">${icon("clock")} حدد موعد اختبارك</a>` : `<span>${icon("clock")} ${p.daysToExam} يومًا للاختبار</span>`}</div></div>${nextLink ? `<a class="dash-next" href="${nextLink}"><span class="dash-next-label">${pendingToday.includes(next) ? "ابدأ من هنا" : "تقدّم أكثر"}</span><b>${e(next.title)}</b><small>${{ watch: "مشاهدة", read: "قراءة", practice: "تدريب", test: "اختبار", review: "مراجعة" }[next.kind] || ""} · ${minutes(next.seconds)} دقيقة</small><span class="dash-go">${icon("play")} ابدأ</span></a>` : `<a class="dash-next dash-next-empty" href="#/choose"><span class="dash-next-label">البداية</span><b>اختر دوراتك</b><small>لتظهر مهامك اليومية هنا</small><span class="dash-go">${icon("arrow")} اختر</span></a>`}</section>
${!p.profile.onboardingCompleted ? `<a class="dash-banner" href="#/welcome">${icon("spark")}<span>عرّفنا على هدفك ووقتك لتناسبك الخطة</span><b>ابدأ ${icon("arrow")}</b></a>` : ""}
<section class="dash-stats">${[
      ["مهام اليوم", ring(p.today.percent)],
      ["إنجاز الأسبوع", ring(p.week.percent)],
      ["وقت المذاكرة", `<b class="stat-num">${minutes(p.today.sessionSeconds)}</b><em>دقيقة اليوم</em>`],
      ["حتى الاختبار", p.daysToExam === null ? '<a class="stat-link" href="#/learning-settings">حدد الموعد</a>' : `<b class="stat-num">${p.daysToExam}</b><em>يومًا</em>`],
    ]
      .map(([t, v]) => `<div class="dash-stat"><span>${t}</span><div>${v}</div></div>`)
      .join("")}</section>
<div class="dash-cols"><div class="dash-col-main">
<section class="dash-card"><div class="dash-card-head"><h2>مهام اليوم</h2><button class="dash-link" data-replan>${icon("calendar")} أعد التوزيع</button></div>${plan.summary && !plan.summary.feasible ? `<div class="dash-warn">${icon("error")}<span>الخطة تحتاج مراجعة: لم يتّسع جزء من المحتوى لوقتك. <a href="#/learning-settings">عدّل وقتك</a></span></div>` : ""}${!plan.summary ? empty("لا توجد خطة بعد", "اختر دوراتك وحدد وقتك لتظهر مهامك هنا.", "calendar", `<a class="btn btn-primary btn-sm" href="#/choose">اختر دوراتك ${icon("arrow")}</a>`) : ""}${plan.summary ? dayTasks.map(taskCard).join("") || empty("مساحة ليومك", "لا مهام مجدولة اليوم. خذ مهمة إضافية أو استرح.", "sun") : ""}${p.today.extraTasks ? `<p class="extra-achieved">${icon("spark")} أنجزت ${p.today.extraTasks} مهام إضافية اليوم</p>` : ""}</section>
${extra.length ? `<details class="dash-card dash-fold"><summary><h2>تقدر تكمل أكثر</h2><span>${extra.length} مهمة ${icon("down")}</span></summary>${extra.slice(0, extraLimit).map(taskCard).join("")}${extra.length > extraLimit ? '<button class="btn btn-outline btn-sm" data-extra-more>عرض المزيد</button>' : ""}</details>` : ""}
${upcoming.length ? `<section class="dash-card"><div class="dash-card-head"><h2>الأيام القادمة</h2></div><div class="week-plan">${upcoming
      .slice(0, dayLimit)
      .map(
        (d) =>
          `<details><summary><strong>${dayLabel(d)}</strong><span>${minutes(all.filter((t) => t.scheduled_date === d).reduce((n, t) => n + t.seconds, 0))} دقيقة</span>${icon("down")}</summary>${all.filter((t) => t.scheduled_date === d).map(taskCard).join("")}</details>`,
      )
      .join("")}</div>${upcoming.length > dayLimit ? '<button class="btn btn-outline btn-sm" data-days-more>عرض بقية الأيام</button>' : ""}</section>` : ""}
</div><aside class="dash-col-side">
<section class="dash-card dash-timer"><div class="timer-top"><span>${icon("clock")} جلسة مذاكرة</span><b id="study-clock">00:00</b></div><button class="btn btn-primary btn-sm" data-study-toggle>${icon("play")} ابدأ التوقيت</button></section>
<section class="dash-card"><div class="dash-card-head"><h2>دوراتي</h2><a class="dash-link" href="#/choose">تعديل</a></div>${p.courses.map((c) => `<a class="course-row" href="#/course/${c.id}"><span class="course-row-title">${e(c.title)}</span><small>${c.watchedLessons}/${c.lessons} دروس</small><div class="progress-track"><span style="width:${c.percent || 0}%"></span></div></a>`).join("") || `<p class="dash-empty">لم تختر دورات بعد.</p>`}</section>
<section class="dash-card"><div class="dash-card-head"><h2>دقة إجاباتي</h2><a class="dash-link" href="#/tests">اختبار</a></div>${p.mastery.map((m) => `<div class="mastery-row"><div><strong>${e(catalog.tracks.find((t) => t.id === m.trackId)?.title || m.trackId)}</strong><small>${m.correct} من ${m.total} سؤال${m.limited ? " · بيانات قليلة" : ""}</small></div><b class="${m.accuracy < 70 ? "low" : ""}">${m.accuracy}٪</b>${m.accuracy < 70 ? `<a href="#/track/${m.trackId}" class="dash-link">راجع الدروس ${icon("arrow")}</a>` : ""}</div>`).join("") || `<p class="dash-empty">تظهر دقتك بعد أول اختبار.</p>`}</section>
</aside></div></div>`;
  }
  function drawSettings() {
    const p = me.profile;
    target.innerHTML = `<form id="learning-settings" class="panel"><div class="form-grid">${field("hours", "ساعات المذاكرة يوميًا", p.dailyMinutes ? p.dailyMinutes / 60 : "", "number", 'min="0.25" max="12" step="0.25" required')}${field("examDate", "موعد الاختبار", p.examDate, "date")}${field("targetScore", "الدرجة المستهدفة", p.targetScore, "number", 'min="0" max="100"')}</div><label>أيام المذاكرة</label>${daysInputs(p.studyDays)}${consent(p)}<p class="muted spaced">سيعاد توزيع المتبقي من اليوم وفق وقتك الجديد. ما أنجزته يبقى محفوظًا.</p><button class="btn btn-primary spaced" type="submit">احفظ وأعد حساب خطتي ${icon("calendar")}</button><div id="learning-form-error" class="form-error" role="alert"></div></form>`;
  }
  async function listTeachers() {
    const q = document.querySelector("#instructor-query")?.value || "",
      result = await api(
        "/api/instructors?q=" + encodeURIComponent(q) + "&limit=50",
      );
    if (disposed) return;
    if (!document.querySelector("#teacher-directory"))
      target.innerHTML = `<form id="instructor-search" class="inline-form"><input id="instructor-query" name="q" type="search" placeholder="ابحث باسم المدرس أو التخصص" aria-label="البحث عن مدرس"><button class="btn btn-primary" type="submit">بحث</button></form><div id="teacher-directory" class="teacher-grid spaced"></div><div id="teacher-more" class="spaced"></div>`;
    document.querySelector("#teacher-directory").innerHTML =
      result.items.map(teacherCard).join("") ||
      empty(
        "المدرسون والمصادر قيد الإضافة.",
        "ستظهر هنا الملفات المنشورة من الإدارة، دون أسماء أو صور افتراضية مختلقة.",
        "user",
      );
    document.querySelector("#teacher-more").innerHTML =
      result.total > result.items.length
        ? `<button class="btn btn-outline" data-teachers-more="${result.items.length}">عرض المزيد من المصادر</button>`
        : "";
  }
  async function drawTeacher() {
    const t = await api("/api/instructors/" + encodeURIComponent(id));
    if (disposed) return;
    target.innerHTML = `<div class="teacher-profile">${teacherCard(t)}<div class="panel"><h2>عن ${e(t.name)}</h2><p>${e(t.bio || "لم تُضف نبذة بعد.")}</p>${t.unknownVideoCount ? notice("بعض المقاطع لم تُستخرج مدتها بعد؛ لا نعرض مدة إجمالية مكتملة قبل توفرها.") : ""}</div></div><h2 class="spaced">الدورات التابعة للمصدر</h2><div class="teacher-courses">${
      t.courses
        .map(
          (c) =>
            `<article class="panel"><span class="badge">${stageName(c.stage)} · ${e(catalog.tracks.find((t) => t.id === c.trackId)?.title || c.subject)}</span><h3 class="spaced">${e(c.title)}</h3><p>${e(c.description)}</p><p>${c.metrics.videoCount} مقاطع · ${c.metrics.lessonCount} دروس · ${c.metrics.attachments} مرفقات</p><div class="spaced">${btn("عرض الدورة", "#/course/" + c.id, "outline")} ${btn("اختر ضمن خطتك", "#/choose", "light")}</div><div class="stack spaced">${c.lessons
              .filter((l) => l.free)
              .map(
                (l) =>
                  `<a class="text-link" href="#/lesson/${c.id}/${l.id}">${icon("play")} معاينة مجانية: ${e(l.title)}</a>`,
              )
              .join("")}</div></article>`,
        )
        .join("") ||
      empty(
        "لا توجد دورات منشورة لهذا المصدر بعد.",
        "تظهر الدورات بعد ربطها ونشرها.",
      )
    }</div><section class="panel spaced"><h2>الاختبارات المرتبطة</h2>${
      catalog.tests
        .filter((test) => t.courseIds.includes(test.courseId))
        .map(
          (test) =>
            `<a class="list-row" href="#/tests/${test.id}"><span>${e(test.title)}</span>${icon("arrow")}</a>`,
        )
        .join("") || "<p>لم تُنشر اختبارات مرتبطة بهذا المصدر بعد.</p>"
    }</section>`;
  }
  function drawTrack() {
    const t = catalog.tracks.find((t) => t.id === id);
    if (!t) {
      target.innerHTML = empty(
        "المسار غير متاح.",
        "قد يكون مخفيًا أو غير منشور.",
      );
      return;
    }
    const courses = catalog.courses.filter((c) => c.trackId === id);
    target.innerHTML = `<div class="track-welcome"><span class="eyebrow">${e(catalog.sections.find((s) => s.id === t.sectionId)?.title || "")}</span><h2>${e(t.title)}</h2><p>اختيارات مستقلة للتأسيس والتدريب، مع أسئلة واختبارات ومراجعة أخطاء.</p><div class="hero-actions">${btn("اختر مدرسك ودورتك", "#/choose")}${btn("بنك أسئلة المسار", "#/bank?track=" + id, "outline")}</div></div><div class="track-shortcuts">${[
      ["التأسيس", "#track-foundation"],
      ["التدريب", "#track-training"],
      ["المدرسون", "#/instructors"],
      ["الاختبارات", "#/tests"],
      ["مراجعة الأخطاء", "#/mistakes"],
    ]
      .map(([name, href]) =>
        href.startsWith("#track")
          ? `<button type="button" data-track-jump="${href.slice(1)}">${name}</button>`
          : `<a href="${href}">${name} ${icon("arrow")}</a>`,
      )
      .join(
        "",
      )}${id === "qudrat-verbal" ? `<a href="#/bank?track=${id}&topic=vocabulary">المفردات ${icon("book")}</a><a href="#/bank?track=${id}&topic=reading">استيعاب المقروء ${icon("book")}</a>` : ""}</div>${[
      "foundation",
      "training",
      "review",
    ]
      .map((stage) => {
        const list = courses.filter((c) => c.stage === stage);
        if (stage === "review" && !list.length) return "";
        return `<section class="journey-section" id="track-${stage}"><h2>${stageName(stage)}</h2><div class="teacher-courses">${list.map((c) => `<article class="panel"><small class="muted">${e(catalog.instructors.find((t) => t.id === c.instructorId)?.name || "دورة مستقلة")}</small><h3>${e(c.title)}</h3><p>${e(c.description)}</p><p>${c.metrics.videoCount} مقاطع · ${c.metrics.videoSeconds ? minutes(c.metrics.videoSeconds) + " دقيقة فيديو معروفة" : "المدة تتحدد من المحتوى المتاح"}</p><div class="spaced">${btn("عرض الدروس", "#/course/" + c.id, "outline")}</div></article>`).join("") || empty("المرحلة في انتظار محتواها.", "يمكن للإدارة إضافة عدة مدرسين ودورات لهذا المسار.")}</div></section>`;
      })
      .join("")}`;
  }
  function drawDiscover() {
    const tests = catalog.tests.filter(
      (t) => t.level === "diagnostic" && t.visible,
    );
    target.innerHTML = `${notice("نقطة البداية تأتي من إجابات فعلية أو من تقييمك الذاتي، ونميّز بين الاثنين. لا نحكم على فهمك من مشاهدة الفيديو.")}<div class="grid-two"><section class="panel"><span class="eyebrow">تعرف على عاداتك وهدفك</span><h2>رحلة قصيرة، ثم تختار.</h2><p>اختبارك، أساسك، وقتك، وموعدك. نستخدمها لبناء خطة قابلة للتعديل.</p><div class="spaced">${btn("عرّفنا عليك", "#/welcome")}</div></section><section class="panel"><span class="eyebrow">قياس بالإجابات</span><h2>اختبارات اكتشاف المستوى</h2>${tests.map((t) => `<a class="list-row" href="#/tests/${t.id}"><span>${e(t.title)}<br><small>${t.count} أسئلة · ${minutes(t.duration)} دقائق</small></span>${icon("arrow")}</a>`).join("") || "<p>لم يُنشر اختبار تشخيصي بعد. يمكنك البدء بأسئلة البنك؛ لن نسمي التقييم الذاتي نتيجة اختبار.</p>"}<div class="spaced">${btn("ابدأ من بنك الأسئلة", "#/bank", "outline")}</div></section></div>`;
  }
  async function stopTimer() {
    clearInterval(timer);
    clearInterval(ping);
    timer = null;
    ping = null;
    if (sessionId) {
      const current = sessionId;
      sessionId = null;
      try {
        await api("/api/learning/study/" + current + "/stop", {
          method: "POST",
          body: {},
          keepalive: true,
        });
      } catch (err) {
        error(err);
      }
    }
  }
  const click = async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.hasAttribute("data-welcome-back")) {
        step = Math.max(0, step - 1);
        drawWizard();
      }
      if (b.dataset.trackJump)
        document.getElementById(b.dataset.trackJump)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
          block: "start",
        });
      if (b.hasAttribute("data-welcome-skip")) await advance(true);
      if (b.dataset.journeyComplete) {
        b.disabled = true;
        await api(
          "/api/learning/tasks/" + b.dataset.journeyComplete + "/complete",
          { method: "POST", body: {} },
        );
        progress = await api("/api/learning/progress");
        await stopTimer();
        if (!disposed) drawJourney();
        toast("حُفظ الإنجاز. الإتقان يُقاس بالأسئلة، لا بالمشاهدة.");
      }
      if (b.hasAttribute("data-replan")) {
        await stopTimer();
        await api("/api/learning/plan", { method: "POST", body: {} });
        await load();
        toast("أُعيد توزيع المتبقي مع الحفاظ على إنجازك.");
      }
      if (b.hasAttribute("data-extra-more")) {
        extraLimit += 6;
        await stopTimer();
        drawJourney();
      }
      if (b.hasAttribute("data-days-more")) {
        dayLimit += 14;
        await stopTimer();
        drawJourney();
      }
      if (b.dataset.teachersMore) {
        const q = document.querySelector("#instructor-query")?.value || "",
          r = await api(
            "/api/instructors?limit=50&offset=" +
              b.dataset.teachersMore +
              "&q=" +
              encodeURIComponent(q),
          );
        document
          .querySelector("#teacher-directory")
          .insertAdjacentHTML("beforeend", r.items.map(teacherCard).join(""));
        const offset = Number(b.dataset.teachersMore) + r.items.length;
        if (offset >= r.total) b.remove();
        else b.dataset.teachersMore = String(offset);
      }
      if (b.hasAttribute("data-study-toggle")) {
        if (sessionId) {
          await stopTimer();
          progress = await api("/api/learning/progress");
          if (!disposed) drawJourney();
        } else {
          const s = await api("/api/learning/study/start", {
            method: "POST",
            body: {},
          });
          sessionId = s.id;
          started = Date.now();
          b.textContent = "أنهِ الجلسة واحفظ الوقت";
          timer = setInterval(() => {
            const n = Math.floor((Date.now() - started) / 1000),
              clock = document.querySelector("#study-clock");
            if (clock)
              clock.textContent =
                String(Math.floor(n / 60)).padStart(2, "0") +
                ":" +
                String(n % 60).padStart(2, "0");
          }, 1000);
          ping = setInterval(() => {
            if (sessionId)
              void api("/api/learning/study/" + sessionId + "/ping", {
                method: "POST",
                body: {},
              }).catch(error);
          }, 20000);
        }
      }
    } catch (err) {
      error(err);
      b.disabled = false;
    }
  };
  const change = (ev) => {
    if (ev.target.name === "courseId") {
      ev.target.checked
        ? chosen.add(ev.target.value)
        : chosen.delete(ev.target.value);
      const count = document.querySelector("#selection-count");
      if (count) count.textContent = chosen.size + " دورات مختارة";
    }
    if (ev.target.id === "choice-teacher") drawChoices();
  };
  const submit = async (ev) => {
    const form = ev.target;
    if (
      ![
        "welcome-form",
        "choices-form",
        "learning-settings",
        "instructor-search",
      ].includes(form.id)
    )
      return;
    ev.preventDefault();
    const button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    try {
      if (form.id === "welcome-form") await advance(false);
      if (form.id === "choices-form") {
        await api("/api/learning/selections", {
          method: "PUT",
          body: { courseIds: [...chosen] },
        });
        location.hash = "#/journey";
      }
      if (form.id === "learning-settings") {
        const fd = new FormData(form);
        await api("/api/learning/profile", {
          method: "PUT",
          body: {
            dailyMinutes: Math.round(Number(fd.get("hours")) * 60),
            examDate: fd.get("examDate") || null,
            targetScore: fd.get("targetScore")
              ? Number(fd.get("targetScore"))
              : null,
            studyDays: fd.getAll("studyDays").map(Number),
            aiContextConsent: fd.has("aiContextConsent"),
          },
        });
        await api("/api/learning/plan", { method: "POST", body: {} });
        location.hash = "#/journey";
        toast("حُفظ وقتك وأعيد حساب المتبقي.");
      }
      if (form.id === "instructor-search") await listTeachers();
    } catch (err) {
      const alert = document.querySelector("#learning-form-error");
      if (alert) alert.textContent = err.message;
      error(err);
    } finally {
      if (button) button.disabled = false;
    }
  };
  const visibility = () => {
    if (document.hidden && sessionId) void stopTimer();
  };
  document.addEventListener("click", click);
  document.addEventListener("change", change);
  document.addEventListener("submit", submit);
  document.addEventListener("visibilitychange", visibility);
  void load();
  return () => {
    disposed = true;
    void stopTimer();
    document.removeEventListener("click", click);
    document.removeEventListener("change", change);
    document.removeEventListener("submit", submit);
    document.removeEventListener("visibilitychange", visibility);
  };
}

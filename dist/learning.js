import { api, account } from "./api.js";
import { db, escape as e, safeUrl } from "./data.js";
import { icon, btn, notice, empty, pageHeading } from "./ui.js";
import { studentShell } from "./pages.js";
export const stageName = (s) =>
  ({ foundation: "التأسيس", training: "التدريب", review: "المراجعة" })[s] || s;
export const courseGroupName = (course) =>
  String(course?.groupTitle || "").trim() || stageName(course?.stage);
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
  const body = ["welcome","choose"].includes(kind) ? loading : `${pageHeading(kind === "settings" ? "إعدادات" : "رحلة مذاكرة على مقاسك", title)}${loading}`;
  return ["settings"].includes(kind) ? studentShell(body, "journey") : body;
}
export function teacherCard(t, trackId = "") {
  const image = t.imageAssetId
    ? "/api/media/" + e(t.imageAssetId)
    : safeUrl(t.imageUrl);
  return `<a href="#/instructor/${e(t.id)}${trackId ? "?track=" + encodeURIComponent(trackId) : ""}" class="teacher-card"><div class="teacher-portrait">${image ? `<img src="${image}" alt="${e(t.name)}" loading="lazy">` : `<span aria-hidden="true">${e(t.name.slice(0, 1))}</span>`}</div><div><span class="badge">${t.kind === "source" ? "مصدر تعليمي" : "مدرّس"}</span><h3>${e(t.name)}</h3><p>${e(t.specialty)}</p><small>${t.courseIds.length} دورات منشورة · ${t.videoCount} مقاطع${t.videoSeconds ? ` · ${minutes(t.videoSeconds)} دقيقة فيديو معروفة` : ""}</small></div>${icon("arrow")}</a>`;
}
const field = (name, label, value = "", type = "text", extra = "") =>
  `<div class="field"><label for="l-${name}">${label}</label><input id="l-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${extra}></div>`;
const daysInputs = (days) =>
  `<div class="study-days">${weekdays.map((d, i) => `<label><input name="studyDays" value="${i}" type="checkbox" ${days?.includes(i) ? "checked" : ""}><span>${d}</span></label>`).join("")}</div>`;
const consent = (p) =>
  `<label class="checkbox learning-consent"><input name="aiContextConsent" type="checkbox" ${p.aiContextConsent ? "checked" : ""}><span>أسمح للمدرس الذكي بالاطلاع على اختياراتي التعليمية وخطتي وأخطائي ونتائج اختباراتي المسجلة لمساعدتي. يمكن تغيير ذلك لاحقًا.</span></label>`;
export function mountLearning(kind, id, toast, rerender) {
  let disposed = false,
    choiceStep = 0,
    settingsStep = 0,
    choiceStages = [],
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
      ["sectionId", "وش اختبارك؟", catalog.sections.filter((s) => s.status !== "coming").map((s) =>
        option("sectionId", s.id, e(s.title), p.sectionId === s.id)).join("")],
      ["studyMode", "وش تحتاج في رحلتك؟", [
        ["both", "تأسيس وتدريب", "أبني الأساس ثم أتدرّب"],
        ["foundation", "تأسيس فقط", "أحتاج أفهم الأساس أولًا"],
        ["training", "تدريب فقط", "عندي أساس وأحتاج حل أسئلة"],
      ].map(([v,t,d]) => `<label class="welcome-choice welcome-choice-v6"><input type="radio" name="studyMode" value="${v}"><span><b>${t}</b><small>${d}</small></span>${icon("check")}</label>`).join("")],
      ["schedule", "متى اختبارك؟ وكم تقدر تذاكر؟",
        field("examDate","موعد الاختبار",p.examDate,"date",'required') +
        field("hours","ساعات المذاكرة يوميًا",p.dailyMinutes ? p.dailyMinutes/60 : 2,"number",'min="0.5" max="12" step="0.5" required') +
        '<p class="muted">تقدر تعدّل الموعد والساعات لاحقًا من إعدادات خطتك.</p>'],
    ];
    step = Math.max(0, Math.min(2, step));
    const [key,title,body] = questions[step];
    target.innerHTML = `<div class="welcome-flow-v6">
      <div class="welcome-flow-top"><span class="eyebrow">إعداد خطتك</span><span class="welcome-flow-progress">${step+1} / 3</span></div>
      <div class="welcome-flow-progressbar"><span style="width:${((step+1)/3)*100}%"></span></div>
      <form id="welcome-form" class="panel welcome-flow-card" data-key="${key}">
        <h1>${title}</h1>
        <p class="muted">${step===0?"اختر المسار، وسننتقل مباشرة.":step===1?"اختر المرحلة التي تحتاجها، وسننتقل مباشرة.":"حدد الموعد والوقت المناسب لك."}</p>
        <div class="welcome-answers">${body}</div>
        <div id="learning-form-error" class="form-error" role="alert"></div>
        <div class="welcome-actions welcome-actions-v6">
          ${step ? '<button type="button" class="btn btn-ghost small" data-welcome-back>رجوع</button>' : ""}
          <button type="button" class="btn btn-ghost small welcome-skip-v6" data-welcome-skip>تخطي</button>
          ${step===2 ? '<button type="submit" class="btn btn-primary">إنشاء خطتي '+icon("arrow")+'</button>' : ""}
        </div>
      </form>
    </div>`;
  }
  async function advance(skip = false) {
    const form = document.querySelector("#welcome-form");
    if (!form) return;
    const key = form.dataset.key, fd = new FormData(form);
    const input = { onboardingStep: Math.min(2, step + 1) };
    if (!skip) {
      if (!form.reportValidity()) return;
      if (step === 0) input.sectionId = fd.get("sectionId");
      if (step === 1) {
        const mode = fd.get("studyMode");
        if (!mode) return;
        input.foundationStarted = mode === "training";
        input.foundationCompleted = mode === "training";
        input.selfLevel = mode === "training" ? "advanced" : mode === "foundation" ? "beginner" : "intermediate";
      }
      if (step === 2) {
        input.examDate = fd.get("examDate") || null;
        input.dailyMinutes = Math.round(Number(fd.get("hours")) * 60);
        input.onboardingCompleted = true;
      }
    } else if (step === 2) {
      input.onboardingCompleted = true;
    }
    const result = await api("/api/learning/profile", { method:"PUT", body:input });
    me.profile = result.profile;
    if (step === 2) location.hash = "#/choose";
    else { step++; drawWizard(); }
  }
  function courseChoice(c) {
    const teacher = catalog.instructors.find((t) => t.id === c.instructorId),
      m = c.metrics;
    return `<label class="course-choice"><input type="checkbox" name="courseId" value="${e(c.id)}" ${chosen.has(c.id) ? "checked" : ""}><span class="course-choice-body"><small>${teacher ? e(teacher.name) : c.instructorId ? "مصدر مؤرشف، والاختيار السابق محفوظ" : "دورة مستقلة — المصدر غير محدد"}</small><b>${e(c.title)}</b><p>${e(c.description)}</p><span class="choice-metrics">${m.videoCount} مقاطع فيديو · ${m.lessonCount - m.videoCount} دروس نصية${m.videoSeconds ? ` · ${minutes(m.videoSeconds)} دقيقة فيديو معروفة` : ""}${m.estimatedSeconds ? ` · ${minutes(m.estimatedSeconds)} دقيقة تقديرية للمحتوى` : ""}</span>${m.unknownVideoCount ? `<em>${m.unknownVideoCount} مقاطع لم تُستخرج مدتها بعد</em>` : ""}<span class="choice-links"><a href="#/course/${c.id}">عرض المحتوى ${icon("arrow")}</a>${teacher ? `<a href="#/instructor/${teacher.id}">عن المدرّس</a>` : ""}</span></span>${icon("check")}</label>`;
  }
  function drawChoices() {
    const section = me.profile.sectionId;
    const tracks = catalog.tracks.filter(t => t.visible && (!section || t.sectionId === section));
    const onlyFoundation = me.profile.selfLevel === "beginner";
    const onlyTraining = me.profile.foundationStarted && me.profile.foundationCompleted;
    if (onlyFoundation || onlyTraining) for (const course of catalog.courses) if ((onlyFoundation && course.stage === "training") || (onlyTraining && course.stage === "foundation")) chosen.delete(course.id);
    choiceStages = tracks.flatMap(track => ["foundation","training"].map(stage => ({track,stage,courses:catalog.courses.filter(course => course.trackId === track.id && course.stage === stage && (!course.instructorId || catalog.instructors.some(t => t.id === course.instructorId && !t.deleted) || chosen.has(course.id)))}))).filter(item => item.courses.length && (!onlyFoundation || item.stage === "foundation") && (!onlyTraining || item.stage === "training"));
    if (!choiceStages.length) { void api("/api/learning/selections",{method:"PUT",body:{courseIds:[...chosen]}}).catch(error); target.innerHTML = '<div class="welcome-flow-v6"><div class="panel welcome-flow-card"><h2>لا توجد مصادر منشورة حاليًا.</h2><a class="btn btn-primary" href="#/journey">تخطي إلى خطتي</a></div></div>'; return; }
    choiceStep = Math.min(choiceStep, choiceStages.length - 1);
    const current = choiceStages[choiceStep];
    target.innerHTML = '<div class="welcome-flow-v6"><div class="welcome-flow-top"><span class="eyebrow">اختيار المدرس</span><span class="welcome-flow-progress">' + (choiceStep+1) + " / " + choiceStages.length + '</span></div><div class="welcome-flow-progressbar"><span style="width:' + ((choiceStep+1)/choiceStages.length*100) + '%"></span></div><section class="panel welcome-flow-card"><h1>اختر مدرس ' + stageName(current.stage) + " — " + e(current.track.title) + '</h1><p class="muted">اضغط على المدرس للانتقال مباشرة، أو تخطَّ هذه المرحلة.</p><div class="choice-teachers-v6">' + [...new Set(current.courses.map(course => course.instructorId || "independent"))].map(teacherId => { const courses=current.courses.filter(course=>(course.instructorId || "independent")===teacherId); const teacher=courses[0].instructorId?catalog.instructors.find(t=>t.id===courses[0].instructorId):null; return '<button type="button" class="welcome-choice choice-teacher-v6" data-choice-teacher="' + e(teacherId) + '"><span class="choice-teacher-avatar">' + e((teacher?.name || "م").slice(0,1)) + '</span><span><b>' + e(teacher?.name || "مصدر مستقل") + '</b><small>' + e(teacher?.specialty || "مصدر تعليمي") + '</small><small>' + courses.map(course=>e(course.title)).join("، ") + '</small></span>' + icon("arrow") + '</button>'; }).join("") + '</div><div class="welcome-actions welcome-actions-v6">' + (choiceStep ? '<button type="button" class="btn btn-ghost small" data-choice-back>رجوع</button>' : "") + '<button type="button" class="btn btn-ghost small welcome-skip-v6" data-choice-skip>تخطي المرحلة</button></div></section></div>';
    return;
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
    const p=me.profile;
    const titles=["كم ساعة تقدر تذاكر يوميًا؟","متى موعد اختبارك؟","وش الدرجة اللي تستهدفها؟","وش أيام المذاكرة المناسبة لك؟"];
    const progress=(settingsStep+1)/4*100;
    let body="";
    if(settingsStep===0){
      const hours=p.dailyMinutes?p.dailyMinutes/60:2;
      body='<div class="welcome-answers settings-hour-options">'+[1,1.5,2,2.5,3,4,5,6].map(v=>'<button type="button" class="welcome-choice '+(hours===v?'is-selected':'')+'" data-settings-hours="'+v+'"><b>'+v+' ساعات</b></button>').join("")+'</div><div class="field"><label for="settings-custom-hours">أو اكتب عدد الساعات</label><input id="settings-custom-hours" type="number" min="0.25" max="12" step="0.25" value="'+e(hours)+'" /></div>';
    }else if(settingsStep===1){
      body=field("examDate","موعد الاختبار",p.examDate,"date")+'<p class="muted">اختر التاريخ للانتقال تلقائيًا للخطوة التالية.</p>';
    }else if(settingsStep===2){
      body=field("targetScore","الدرجة المستهدفة",p.targetScore??"","number",'min="0" max="100" placeholder="مثال: 90"')+'<p class="muted">تقدر تتخطى تحديد الدرجة إذا ما قررت هدفك بعد.</p>';
    }else{
      body=daysInputs(p.studyDays)+'<p class="muted">اختر الأيام التي تناسب جدولك. تقدر تختار أكثر من يوم.</p>'+consent(p);
    }
    target.innerHTML='<div class="welcome-flow-v6 settings-wizard"><div class="welcome-flow-top"><span class="eyebrow">تخصيص خطتك</span><span class="welcome-flow-progress">'+(settingsStep+1)+' / 4</span></div><div class="welcome-flow-progressbar"><span style="width:'+progress+'%"></span></div><form id="learning-settings" class="panel welcome-flow-card" data-settings-step="'+settingsStep+'"><h1>'+titles[settingsStep]+'</h1><p class="muted">'+(settingsStep===0?"اختر وقتك اليومي.":settingsStep===1?"حدد تاريخ اختبارك.":settingsStep===2?"حدد هدفًا واقعيًا يناسبك.":"حدد أيام المذاكرة التي تناسبك.")+'</p><div class="welcome-answers">'+body+'</div><div id="learning-form-error" class="form-error" role="alert"></div><div class="welcome-actions welcome-actions-v6">'+(settingsStep?'<button type="button" class="btn btn-ghost small" data-settings-back>رجوع</button>':"")+'<button type="button" class="btn btn-ghost small welcome-skip-v6" data-settings-skip>تخطي</button>'+(settingsStep===3?'<button type="submit" class="btn btn-primary">حفظ الخطة '+icon("arrow")+'</button>':settingsStep===1?'<button type="submit" class="btn btn-primary">متابعة '+icon("arrow")+'</button>':settingsStep===2?'<button type="submit" class="btn btn-primary">متابعة '+icon("arrow")+'</button>':"")+'</div></form></div>';
  }
  async function saveSettingsStep(skip=false){
    const form=document.querySelector("#learning-settings");if(!form)return;
    const fd=new FormData(form),input={};
    if(settingsStep===0){const custom=Number(document.querySelector("#settings-custom-hours")?.value||0);if(!skip&&(!Number.isFinite(custom)||custom<0.25||custom>12)){toast("أدخل وقتًا بين 15 دقيقة و12 ساعة.");return;}if(!skip)input.dailyMinutes=Math.round(custom*60);}
    if(settingsStep===1&&!skip){const date=fd.get("examDate");if(date)input.examDate=date;}
    if(settingsStep===2&&!skip){const score=fd.get("targetScore");input.targetScore=score?Number(score):null;}
    if(settingsStep===3&&!skip){input.studyDays=fd.getAll("studyDays").map(Number);input.aiContextConsent=fd.has("aiContextConsent");}
    if(Object.keys(input).length){const result=await api("/api/learning/profile",{method:"PUT",body:input});me.profile=result.profile;}
    if(settingsStep<3){settingsStep++;drawSettings();return;}
    await api("/api/learning/plan",{method:"POST",body:{}});
    location.hash="#/journey";toast("حُفظت اختياراتك وأُعيد حساب خطتك.");
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
    const trackId = new URLSearchParams(location.hash.split("?")[1] || "").get("track") || "";
    const courses = t.courses.filter((course) => !trackId || course.trackId === trackId)
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const courseIds = new Set(courses.map((course) => course.id));
    const groups = new Map();
    for (const course of courses) {
      const name = courseGroupName(course);
      if (!groups.has(name)) groups.set(name, []);
      groups.get(name).push(course);
    }
    const tests = catalog.tests.filter((test) => courseIds.has(test.courseId));
    const linkedFiles = courses.flatMap((course) => {
      const source = db.courses.find((item) => item.id === course.id);
      return (source?.lessons || []).flatMap((lesson) =>
        (lesson.fileAssetIds || []).map((assetId, index) => ({
          id: assetId, course: course.title, lesson: lesson.title, index: index + 1,
        })),
      );
    });
    target.innerHTML = `<div class="teacher-profile">${teacherCard(t, trackId)}<div class="panel"><h2>عن ${e(t.name)}</h2><p>${e(t.bio || "لم تُضف نبذة بعد.")}</p>${t.unknownVideoCount ? notice("بعض المقاطع لم تُستخرج مدتها بعد؛ لا نعرض مدة إجمالية مكتملة قبل توفرها.") : ""}</div></div>
      <nav class="teacher-resource-nav" aria-label="محتوى المصدر">
        <button type="button" data-teacher-jump="teacher-lessons">${icon("play-circle")} الدروس والشروحات</button>
        <button type="button" data-teacher-jump="teacher-files">${icon("files")} الملفات <span>${linkedFiles.length}</span></button>
        <button type="button" data-teacher-jump="teacher-tests">${icon("clipboard-check")} الاختبارات <span>${tests.length}</span></button>
        <a href="#/tutor">${icon("bot")} اسأل مدرس رُزمة</a>
      </nav>
      <section id="teacher-lessons" class="spaced"><h2>الدروس والشروحات</h2>
        ${[...groups.entries()].map(([name, items]) => `<section class="journey-section"><h3>${e(name)}</h3><div class="teacher-courses">${items.map((course) => `<article class="panel"><span class="badge">${e(catalog.tracks.find((track) => track.id === course.trackId)?.title || course.subject)}</span><h3 class="spaced">${e(course.title)}</h3><p>${e(course.description)}</p><p>${course.metrics.videoCount} مقاطع · ${course.metrics.lessonCount} دروس · ${course.metrics.attachments} مرفقات</p><div class="stack spaced">${course.lessons.map((lesson) => `<a class="list-row" href="#/lesson/${course.id}/${lesson.id}"><span>${icon(lesson.video ? "play-circle" : "book-open")} ${e(lesson.title)}</span>${icon("arrow")}</a>`).join("")}</div><div class="spaced">${btn("فتح الدورة كاملة", "#/course/" + course.id, "outline")}</div></article>`).join("")}</div></section>`).join("") || empty("لا توجد دروس منشورة لهذا المصدر في هذا المسار.", "يمكن للإدارة إضافة الدورات وربطها بهذا المصدر من لوحة المالك.") }
      </section>
      <section id="teacher-files" class="panel spaced"><h2>الملفات التعليمية</h2>
        ${linkedFiles.map((file) => `<a class="list-row" href="/api/media/${e(file.id)}" target="_blank" rel="noopener noreferrer"><span>${icon("file-pdf")} ملف ${file.index} · ${e(file.lesson)}<br><small>${e(file.course)}</small></span>${icon("external-link")}</a>`).join("") || "<p>لا توجد ملفات مرتبطة بدروس هذا المصدر بعد.</p>"}
      </section>
      <section id="teacher-tests" class="panel spaced"><h2>الاختبارات</h2>
        ${tests.map((test) => `<a class="list-row" href="#/tests/${test.id}"><span>${e(test.title)}<br><small>${test.count} أسئلة · ${minutes(test.duration)} دقائق</small></span>${icon("arrow")}</a>`).join("") || "<p>لم تُنشر اختبارات مرتبطة بهذا المصدر بعد.</p>"}
      </section>`;
  }
  function drawTrack() {
    const track = catalog.tracks.find((item) => item.id === id);
    if (!track) {
      target.innerHTML = empty("المسار غير متاح.", "قد يكون مخفيًا أو غير منشور.");
      return;
    }
    const courses = catalog.courses.filter((course) => course.trackId === id);
    const sourceIds = new Set(courses.map((course) => course.instructorId).filter(Boolean));
    const sources = catalog.instructors.filter((source) => sourceIds.has(source.id));
    const independent = courses.filter((course) => !course.instructorId);
    target.innerHTML = `<div class="track-welcome"><span class="eyebrow">${e(catalog.sections.find((item) => item.id === track.sectionId)?.title || "")}</span><h2>${e(track.title)}</h2><p>اختر المدرس أو المصدر التعليمي الذي تريد الدراسة معه.</p></div>
      <section class="spaced"><div class="admin-bar"><h2>المدرسون والمصادر</h2><span class="muted">${sources.length} مصادر منشورة</span></div>
        <div class="teacher-grid">${sources.map((source) => teacherCard(source, id)).join("") || empty("لا توجد مصادر منشورة لهذا المسار بعد.", "يمكن للإدارة إضافة مدرس وربطه بدورات هذا المسار.")}</div>
      </section>
      ${independent.length ? `<section class="spaced"><h2>دورات مستقلة</h2><div class="teacher-courses">${independent.map((course) => `<article class="panel"><span class="badge">${e(courseGroupName(course))}</span><h3>${e(course.title)}</h3><p>${e(course.description)}</p>${btn("عرض الدروس والملفات والاختبارات", "#/course/" + course.id, "outline")}</article>`).join("")}</div></section>` : ""}
      <div class="track-shortcuts spaced"><a href="#/bank?track=${encodeURIComponent(id)}">بنك أسئلة المسار ${icon("arrow")}</a><a href="#/tests">الاختبارات العامة ${icon("arrow")}</a><a href="#/mistakes">دفتر الأخطاء ${icon("arrow")}</a>${id === "qudrat-verbal" ? `<a href="#/bank?track=${id}&topic=vocabulary">المفردات ${icon("book")}</a><a href="#/bank?track=${id}&topic=reading">استيعاب المقروء ${icon("book")}</a>` : ""}</div>`;
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
      if(b.hasAttribute("data-settings-back")){settingsStep=Math.max(0,settingsStep-1);drawSettings();return;}
      if(b.hasAttribute("data-settings-skip")){await saveSettingsStep(true);return;}
      if(b.dataset.settingsHours){const v=Number(b.dataset.settingsHours);const result=await api("/api/learning/profile",{method:"PUT",body:{dailyMinutes:Math.round(v*60)}});me.profile=result.profile;settingsStep=1;drawSettings();return;}
      if (b.dataset.choiceTeacher !== undefined) { const stage=choiceStages[choiceStep]; if(stage){ for(const x of stage.courses) chosen.delete(x.id); for(const x of stage.courses) if((x.instructorId || "independent")===b.dataset.choiceTeacher) chosen.add(x.id); await api("/api/learning/selections",{method:"PUT",body:{courseIds:[...chosen]}}); choiceStep++; if(choiceStep>=choiceStages.length) location.hash="#/journey"; else drawChoices(); } return; }
      if (b.hasAttribute("data-choice-skip")) { const stage=choiceStages[choiceStep]; if(stage){for(const x of stage.courses) chosen.delete(x.id); await api("/api/learning/selections",{method:"PUT",body:{courseIds:[...chosen]}}); choiceStep++; if(choiceStep>=choiceStages.length) location.hash="#/journey"; else drawChoices();} return; }
      if (b.hasAttribute("data-choice-back")) { choiceStep=Math.max(0,choiceStep-1); drawChoices(); return; }
      if (b.hasAttribute("data-welcome-back")) {
        step = Math.max(0, step - 1);
        drawWizard();
      }
      if (b.dataset.teacherJump)
        document.getElementById(b.dataset.teacherJump)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (kind === "welcome" && ["sectionId","studyMode"].includes(ev.target.name)) {
      void advance(false).catch(error);
    }
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
      if (form.id === "welcome-form" && step === 2) await advance(false);
      if (form.id === "choices-form") {
        await api("/api/learning/selections", {
          method: "PUT",
          body: { courseIds: [...chosen] },
        });
        location.hash = "#/journey";
      }
      if (form.id === "learning-settings") {
        if(settingsStep===1){const fd=new FormData(form);const date=fd.get("examDate");if(!date){toast("اختر موعد الاختبار أو اضغط تخطي.");return;}const result=await api("/api/learning/profile",{method:"PUT",body:{examDate:date}});me.profile=result.profile;settingsStep=2;drawSettings();}
        else if(settingsStep===2){await saveSettingsStep(false);}
        else if(settingsStep===3){await saveSettingsStep(false);}
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

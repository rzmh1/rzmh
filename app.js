import {
  storeTeachersPage,
  storeTrackPage,
  mountCatalog,
} from "./store-catalog.js";
import { afterAuthRoute, authLink } from "./course-policy.js";
import { learningPage, mountLearning } from "./learning.js";
import { mountLessonStudy } from "./lesson-study.js";
import { updatesPage, mountStorefront } from "./storefront.js";
import {
  db,
  initialize,
  reloadContent,
  setStudent,
  student,
  saveStudent,
  visibleCourses,
  visibleQuestions,
  read,
  escape as e,
} from "./data.js";
import { header, footer, icon, btn, notice, empty, courseCard } from "./ui.js";
import { inStudentSpace, studentFrame } from "./student-shell.js";
import * as pages from "./pages.js";
import { mountDrawing } from "./drawing.js";
import { adminPage, mountAdmin } from "./admin.js";
import { api, account, setSession } from "./api.js";
import {
  authLive,
  reviewOrder,
  paymentStatus,
  loadPaymentStatus,
  tutorLive,
  mountTutor,
} from "./live-pages.js";
const app = document.querySelector("#app");
let trackedPage = null;
let cleanups = [],
  toastTimer,
  quiz = null,
  bankFilter = { search: "", section: "all", subject: "all" },
  subjectFilter = "all";
const route = () =>
  location.hash.split("?")[0].replace(/^#\/?/, "").split("/").filter(Boolean);
export function toast(message) {
  const t = document.querySelector("#toast");
  t.textContent = message;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 3500);
}
const persistStudent = async () => {
  try {
    await saveStudent();
    return true;
  } catch (err) {
    toast(err.message);
    return false;
  }
};
function persistQuiz() {}
function quizMarkup() {
  if (!quiz)
    return empty(
      "نبدأ من أول خطوة",
      "ابدأ الاختبار التوضيحي لتشاهد الأسئلة والمؤقت.",
      "clock",
      btn("إلى الاختبارات", "#/tests"),
    );
  const q = quiz.questions[quiz.index];
  return pages.studentShell(
    `<div class="quiz-header"><div><span class="eyebrow">اختبار رُزمة</span><h2>السؤال ${quiz.index + 1} من ${quiz.questions.length}</h2></div><div class="timer" role="timer" aria-label="الوقت المتبقي">${icon("clock")}<span id="quiz-timer">${formatTime(quiz.deadline - Date.now())}</span></div></div><div class="progress-track"><span style="width:${((quiz.index + 1) / quiz.questions.length) * 100}%"></span></div><div class="spaced">${pages.questionCard(q, true)}</div><div class="admin-bar"><button class="btn btn-outline" data-action="quiz-prev" ${quiz.index === 0 ? "disabled" : ""}>السابق</button><span class="muted">${Object.keys(quiz.answers).length} إجابات محفوظة</span>${quiz.index === quiz.questions.length - 1 ? `<button class="btn btn-primary" data-action="finish-quiz">إنهاء وعرض النتيجة ${icon("check")}</button>` : `<button class="btn btn-primary" data-action="quiz-next">السؤال التالي ${icon("arrow")}</button>`}</div><p class="muted">يمكنك ترك السؤال دون إجابة. تُحفظ الإجابات والمؤقت عند العودة لهذه الصفحة.</p>`,
    "tests",
  );
}
function formatTime(ms) {
  const secs = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}
let finishing = false;
async function finishQuiz() {
  if (!quiz || finishing) return;
  finishing = true;
  try {
    const response = await api("/api/attempts/" + quiz.id + "/finish", {
      method: "POST",
      body: {},
    });
    setStudent(response.student);
    quiz = null;
    location.hash = "#/results/" + response.result.id;
  } catch (err) {
    toast(err.message);
  } finally {
    finishing = false;
  }
}
export function render(scroll = true) {
  for (const dispose of cleanups) dispose();
  cleanups = [];
  let [r, id, lid] = route();
  r ||= "home";
  let content = "",
    wrapped = true;
  const titles = {
    home: "استعدادك للدرجة الأعلى",
    sections: "المسارات التعليمية",
    pricing: "الاشتراك الشامل",
    updates: "الجديد في رُزمة",
    dashboard: "مساحتي",
    bank: "بنك الأسئلة",
    tests: "الاختبارات",
    scratch: "ورقة المسودة",
    admin: "لوحة الإدارة",
    tutor: "المدرس الذكي",
    login: "تسجيل الدخول",
    signup: "إنشاء حساب",
  };
  document.title = `رُزمة — ${titles[r] || "مساحة لطموحك"}`;
  const trackKey = route().join("/") || "home";
  if (trackedPage !== trackKey) {
    trackedPage = trackKey;
    void api("/api/events", { method: "POST", body: { page: r } }).catch(
      () => {},
    );
  }
  if (/^#[0-9a-f]{6}$/i.test(db.brand.color))
    document.documentElement.style.setProperty("--purple", db.brand.color);
  const privatePages = [
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
  ];
  if (privatePages.includes(r) && !account.user) {
    content = empty(
      "مساحتك تبدأ بحسابك.",
      "سجّل الدخول لحفظ تقدمك والوصول لأدوات المذاكرة.",
      "user",
      btn("تسجيل الدخول", "#/login"),
    );
  } else if (
    account.user &&
    !account.entitled &&
    [
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
    ].includes(r)
  ) {
    content = empty(
      "منصة الطالب ضمن اشتراكك الشامل.",
      "حسابك المجاني جاهز لمعاينة المحتوى. اختر اشتراكك لبدء الدورات والخطة وأدوات المذاكرة.",
      "lock",
      btn("شاهد الباقات", "#/pricing") +
        btn("استعرض الدورات", "#/sections", "outline"),
    );
  } else
    try {
      switch (r) {
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
            new URLSearchParams(location.hash.split("?")[1] || "").get(
              "preview",
            ),
          );
          break;
        case "lesson": {
          content = pages.lessonPage(id, lid);
          const c = visibleCourses().find((c) => c.id === id),
            l = c?.lessons.find((l) => l.id === lid);
          if (l && account.user && !l.locked) {
            student.lastLesson = { id: lid, course: id, title: l.title };
            persistStudent();
          }
          break;
        }
        case "tools":
          content = `<div class="page-heading"><span class="eyebrow">كل أدواتك، في رُزمة</span><h1>مساحة مذاكرة متكاملة.</h1><p>جرّب الأدوات المتاحة دون حساب. تُحفظ بيانات المذاكرة في حسابك.</p></div><div class="panel">${pages.toolsGrid()}</div>`;
          break;
        case "dashboard":
          content = learningPage("journey");
          break;
        case "welcome":
          content = learningPage("welcome");
          break;
        case "choose":
          content = learningPage("choose");
          break;
        case "journey":
          content = learningPage("journey");
          break;
        case "learning-settings":
          content = learningPage("settings");
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
        case "discover":
          content = learningPage("discover");
          break;
        case "bank":
          content = pages.bankPage();
          break;
        case "plan":
          content = pages.planPage();
          break;
        case "progress":
          content = learningPage("journey");
          break;
        case "mistakes":
          content = pages.mistakesPage();
          break;
        case "tests":
          content = pages.testsPage(id);
          break;
        case "quiz":
          content = quizMarkup();
          break;
        case "results":
          content = pages.resultsPage(id);
          break;
        case "scratch":
          content = pages.scratchPage();
          break;
        case "tutor":
          content = tutorLive();
          break;
        case "login":
          content = authLive();
          break;
        case "signup":
          content = authLive(true);
          break;
        case "subscription":
          content = reviewOrder(id);
          break;
        case "admin":
          content =
            account.user?.role === "admin"
              ? adminPage()
              : empty(
                  "دخول خاص بمالك المنصة",
                  "تحتاج تسجيل الدخول بحساب مدير. لا تمنح حسابات الطلاب صلاحية الإدارة.",
                  "lock",
                  btn("تسجيل الدخول", "#/login"),
                );
          break;
        case "payment":
          content = paymentStatus(id === "success");
          break;
        case "about":
          content = pages.aboutPage();
          break;
        default:
          content = pages.notFound();
      }
    } catch (err) {
      console.error(err);
      content = empty(
        "تعذر عرض هذه الصفحة",
        "جرّب العودة للرئيسية أو استعادة بيانات النموذج من الإدارة.",
        "error",
        btn("الرئيسية", "#/"),
      );
    }
  const appSpace = inStudentSpace(r);
  document.body.classList.toggle("in-app", appSpace);
  document.body.classList.remove("app-menu-open");
  app.innerHTML = appSpace
    ? studentFrame(content, r)
    : `${header()}<main id="main" tabindex="-1" ${wrapped ? 'class="container page-content"' : ""}>${content}</main>${footer()}`;
  if (r === "admin" && account.user?.role === "admin")
    cleanups.push(mountAdmin(toast, render));
  if (r === "tutor" && account.user) cleanups.push(mountTutor(toast));
  if (r === "payment")
    void loadPaymentStatus(toast).then((cleanup) => cleanups.push(cleanup));
  void mountCustom(r);
  if (r === "scratch") cleanups.push(mountDrawing(toast));
  const learningKinds = {
    dashboard: "journey",
    progress: "journey",
    journey: "journey",
    welcome: "welcome",
    choose: "choose",
    "learning-settings": "settings",
    instructors: "instructors",
    instructor: "instructor",
    track: "track",
    discover: "discover",
  };
  if (learningKinds[r] && document.querySelector("#learning-root"))
    cleanups.push(mountLearning(learningKinds[r], id, toast, render));

  if (["home", "updates"].includes(r)) cleanups.push(mountStorefront());
  if (
    [
      "sections",
      "section",
      "course",
      "track",
      "instructors",
      "instructor",
    ].includes(r)
  )
    cleanups.push(mountCatalog());
  if (r === "bank" && account.user) {
    const params = new URLSearchParams(location.hash.split("?")[1] || "");
    const selectedTrack = db.tracks?.find((t) => t.id === params.get("track"));
    if (selectedTrack) {
      bankFilter.section = selectedTrack.sectionId;
      bankFilter.subject = selectedTrack.subject;
    }
    bankFilter.topic = params.get("topic") || null;
    bankFilter.question = params.get("question") || null;
    bankFilter.questions =
      params.get("questions")?.split(",").filter(Boolean) || null;
    if (bankFilter.questions?.length) {
      bankFilter.section = "all";
      bankFilter.subject = "all";
      bankFilter.search = "";
    }
    document.querySelector("#question-search").value = bankFilter.search;
    document.querySelector("#question-section").value = bankFilter.section;
    document.querySelector("#question-subject").value = bankFilter.subject;
    filterBank();
  }
  if (r === "section") filterSection(id);
  if (r === "quiz" && quiz) {
    const selected = quiz.answers[quiz.questions[quiz.index].id];
    if (selected !== undefined)
      document
        .querySelector(`[data-quiz-answer][data-choice="${selected}"]`)
        ?.classList.add("selected");
    let expired = false;
    const update = () => {
      if (!quiz) return;
      const t = document.querySelector("#quiz-timer");
      if (t) t.textContent = formatTime(quiz.deadline - Date.now());
      if (Date.now() >= quiz.deadline && !expired) {
        expired = true;
        finishQuiz();
        toast("انتهى الوقت، تم حفظ نتيجتك");
      }
    };
    const timer = setInterval(update, 500);
    cleanups.push(() => clearInterval(timer));
    update();
  }
  if (r === "lesson") {
    if (account.user) cleanups.push(mountLessonStudy(toast));
    const params = new URLSearchParams(location.hash.split("?")[1] || ""),
      start = Number(params.get("start"));
    const video = document.querySelector(".lesson-video");
    if (video && start > 0)
      video.addEventListener(
        "loadedmetadata",
        () => {
          if (Number.isFinite(video.duration))
            video.currentTime = Math.min(start, video.duration);
        },
        { once: true },
      );
  }
  if (scroll) {
    window.scrollTo(0, 0);
    if (location.hash)
      document.querySelector("#main")?.focus({ preventScroll: true });
    const anchor =
      r === "course" &&
      new URLSearchParams(location.hash.split("?")[1] || "").get("preview")
        ? "course-preview"
        : r === "home"
          ? new URLSearchParams(location.hash.split("?")[1] || "").get(
              "section",
            )
          : null;
    if (anchor && /^[a-z-]+$/.test(anchor))
      document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  }
}
function filterSection(id) {
  const target = document.querySelector("#section-courses");
  if (!target) return;
  target.innerHTML =
    visibleCourses()
      .filter(
        (c) =>
          c.sectionId === id &&
          (subjectFilter === "all" || c.subject === subjectFilter),
      )
      .map(courseCard)
      .join("") ||
    empty("مساحة لمحتوى جديد", "لا توجد دورات منشورة تحت هذا التصنيف بعد.");
  document.querySelectorAll("[data-subject]").forEach((b) => {
    b.classList.toggle("active", b.dataset.subject === subjectFilter);
    b.setAttribute("aria-pressed", b.dataset.subject === subjectFilter);
  });
}
function filterBank() {
  const target = document.querySelector("#question-list");
  if (!target) return;
  const f = bankFilter;
  const qs = visibleQuestions().filter(
    (q) =>
      (f.section === "all" || q.sectionId === f.section) &&
      (f.subject === "all" || q.subject === f.subject) &&
      [q.text, q.subject].join(" ").includes(f.search) &&
      (!f.topic || q.topicId === f.topic) &&
      (!f.questions?.length || f.questions.includes(q.id)) &&
      (!f.question || q.id === f.question),
  );
  target.innerHTML =
    qs.map((q) => pages.questionCard(q)).join("") ||
    empty("جرّب كلمة أو مادة أخرى", "لا توجد أسئلة تطابق هذا البحث.", "search");
}
async function answer(id, choice) {
  try {
    const result = await api("/api/practice", {
      method: "POST",
      body: { id, choice },
    });
    setStudent(result.student);
    render(false);
    document
      .querySelector(`[data-question="${id}"] .explanation`)
      ?.focus({ preventScroll: true });
    toast(
      choice === result.correct
        ? "إجابة موفقة!"
        : "حُفظ السؤال في دفتر الأخطاء للمراجعة",
    );
  } catch (err) {
    toast(err.message);
  }
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.action === "theme") {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    try {
      localStorage.setItem("ruzmah-theme", dark ? "dark" : "light");
    } catch {}
    b.innerHTML = icon(dark ? "sun" : "moon");
    b.setAttribute(
      "aria-label",
      dark ? "تفعيل الوضع النهاري" : "تفعيل الوضع الليلي",
    );
  }
  if (d.action === "student-menu") {
    const opened = document.body.classList.toggle("app-menu-open");
    document
      .querySelector(".app-menu-btn")
      ?.setAttribute("aria-expanded", opened);
  }
  if (d.action === "mobile-menu") {
    const opened = document.querySelector("#main-nav").classList.toggle("open");
    b.setAttribute("aria-expanded", opened);
    b.setAttribute(
      "aria-label",
      opened ? "إغلاق قائمة التنقل" : "فتح قائمة التنقل",
    );
    b.innerHTML = icon(opened ? "close" : "menu");
  }
  if (d.subject) {
    subjectFilter = d.subject;
    filterSection(route()[1]);
  }
  if (d.answer) answer(d.answer, Number(d.choice));
  if (d.action === "retry") {
    delete student.answers[d.id];
    persistStudent();
    render(false);
  }
  if (d.action === "remove-mistake") {
    try {
      await api("/api/mistakes", { method: "DELETE", body: { id: d.id } });
    } catch (err) {
      toast(err.message);
      return;
    }
    student.mistakes = student.mistakes.filter((id) => id !== d.id);
    render(false);
    toast("تمت إزالة السؤال من دفتر الأخطاء");
  }
  if (d.action === "complete-lesson") {
    try {
      await api(`/api/learning/lessons/${d.course}/${d.id}/complete`, {
        method: "POST",
        body: {},
      });
    } catch (err) {
      toast(err.message);
      return;
    }
    if (!student.completed.includes(d.id)) student.completed.push(d.id);
    if (await persistStudent()) {
      render(false);
      toast("تم حفظ تقدمك. كل خطوة تفرق!");
    }
  }
  if (d.action === "delete-task") {
    student.tasks = student.tasks.filter((t) => t.id !== d.id);
    persistStudent();
    render(false);
  }
  if (d.action === "logout") {
    try {
      await api("/api/auth/logout", { method: "POST", body: {} });
      await initialize();
      location.hash = "#/";
      render();
    } catch (err) {
      toast(err.message);
    }
  }
  if (d.action === "start-quiz") {
    try {
      quiz = await api("/api/tests/start", {
        method: "POST",
        body: { id: d.test },
      });
      location.hash = "#/quiz";
    } catch (err) {
      toast(err.message);
      if (err.status === 403) location.hash = "#/pricing";
    }
  }
  if (d.quizAnswer && quiz) {
    try {
      await api("/api/attempts/" + quiz.id + "/answer", {
        method: "POST",
        body: { id: d.quizAnswer, choice: Number(d.choice) },
      });
      quiz.answers[d.quizAnswer] = Number(d.choice);
      document
        .querySelectorAll("[data-quiz-answer]")
        .forEach((o) => o.classList.toggle("selected", o === b));
    } catch (err) {
      toast(err.message);
    }
  }
  if (d.action === "quiz-prev" && quiz) {
    quiz.index = Math.max(0, quiz.index - 1);
    persistQuiz();
    render(false);
  }
  if (d.action === "quiz-next" && quiz) {
    quiz.index = Math.min(quiz.questions.length - 1, quiz.index + 1);
    persistQuiz();
    render(false);
  }
  if (d.action === "finish-quiz") finishQuiz();
});
document.addEventListener("input", (ev) => {
  if (ev.target.id === "question-search") {
    bankFilter.search = ev.target.value;
    filterBank();
  }
});
document.addEventListener("change", (ev) => {
  if (ev.target.dataset.task) {
    const t = student.tasks.find((t) => t.id === ev.target.dataset.task);
    if (t) t.done = ev.target.checked;
    persistStudent();
    render(false);
  }
  if (ev.target.id === "question-section") {
    bankFilter.section = ev.target.value;
    filterBank();
  }
  if (ev.target.id === "question-subject") {
    bankFilter.subject = ev.target.value;
    filterBank();
  }
});
document.addEventListener("submit", async (ev) => {
  const form = ev.target;
  if (form.id === "task-form") {
    ev.preventDefault();
    const text = new FormData(form).get("task").trim();
    if (!text) return;
    student.tasks.push({ id: crypto.randomUUID(), text, done: false });
    persistStudent();
    render(false);
    toast("أُضيفت خطوتك القادمة");
  }
  if (form.id === "auth-form") {
    ev.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    const values = Object.fromEntries(new FormData(form));
    try {
      await api(
        form.dataset.signup === "true"
          ? "/api/auth/register"
          : "/api/auth/login",
        { method: "POST", body: values },
      );
      await initialize();
      location.hash = afterAuthRoute(
        account,
        new URLSearchParams(location.hash.split("?")[1] || "").get("next"),
      );
      render();
      toast("أهلًا بك في رُزمة");
    } catch (err) {
      document.querySelector("#form-error").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }
  if (form.id === "subscription-form") {
    ev.preventDefault();
    if (!account.user) {
      toast("سجّل الدخول أولًا، ثم راجع اشتراكك.");
      location.hash = authLink(false, "/subscription/" + form.dataset.plan);
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const result = await api("/api/checkout", {
        method: "POST",
        body: { planId: form.dataset.plan, consent: true },
      });
      if (result.external) {
        document.querySelector("#external-payment-note").innerHTML =
          notice(result.message) +
          `<a class="btn btn-primary" href="${e(result.url)}" target="_blank" rel="noopener noreferrer">فتح بوابة الدفع الخارجية</a>`;
      } else location.assign(result.url);
    } catch (err) {
      document.querySelector("#checkout-error").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  }
});
window.addEventListener("hashchange", () => {
  subjectFilter = "all";
  render();
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".nav-dropdown"))
    document.querySelector(".nav-dropdown")?.removeAttribute("open");
});
try {
  await initialize();
  if (account.user) {
    try {
      quiz = await api("/api/attempts/current");
    } catch {}
  }
  render();
} catch (err) {
  app.innerHTML =
    header() +
    `<main class="container page-content">${empty("تعذر الاتصال بخادم رُزمة.", "هذه النسخة تحتاج تشغيل الخادم. افتحها عبر npm start أو الاستضافة المهيأة. " + e(err.message), "error")}</main>` +
    footer();
}
async function mountCustom(page) {
  if (["admin", "login", "signup"].includes(page)) return;
  try {
    const versions = await api("/api/custom");
    if ((route()[0] || "home") !== page) return;
    const matches = versions.filter(
      (v) =>
        v.scope === "all" ||
        v.scope === page ||
        (v.scope === "internal" && page !== "home"),
    );
    const main = document.querySelector("#main");
    for (const v of matches) {
      const frame = document.createElement("iframe");
      frame.src = "/custom/published/" + v.id;
      frame.sandbox = "allow-scripts";
      frame.title = "قسم مخصص من رُزمة";
      frame.className = "custom-frame";
      frame.height = v.height;
      frame.referrerPolicy = "no-referrer";
      main.append(frame);
    }
  } catch {}
}

document.addEventListener("keydown", (ev) => {
  if (ev.key !== "Escape") return;
  const nav = document.querySelector("#main-nav"),
    toggle = document.querySelector('[data-action="mobile-menu"]');
  if (nav?.classList.contains("open")) {
    nav.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
    if (toggle) {
      toggle.innerHTML = icon("menu");
      toggle.focus();
    }
  }
  document.querySelector(".nav-dropdown")?.removeAttribute("open");
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest("#main-nav a")) return;
  document.querySelector("#main-nav")?.classList.remove("open");
  const toggle = document.querySelector('[data-action="mobile-menu"]');
  toggle?.setAttribute("aria-expanded", "false");
  if (toggle) toggle.innerHTML = icon("menu");
});
document.addEventListener("click", (ev) => {
  if (!ev.target.closest(".skip")) return;
  ev.preventDefault();
  const main = document.querySelector("#main");
  main?.focus({ preventScroll: true });
  main?.scrollIntoView({ block: "start" });
});

import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { account } from "../dist/api.js";
import { db } from "../dist/data.js";
import { mountLearning, learningPage, teacherCard, courseGroupName } from "../dist/learning.js";
import { coursePage, lessonPage } from "../dist/pages.js";
import { mountLessonStudy } from "../dist/lesson-study.js";

test("onboarding screens submit independent answers, allow skipping, and choose four different course sources", async () => {
  const keys = ["document", "fetch", "FormData", "location"],
    previous = Object.fromEntries(keys.map((k) => [k, globalThis[k]])),
    oldUser = account.user;
  const root = { innerHTML: "" },
    error = { textContent: "" },
    events = {},
    requests = [];
  let profile = {
      onboardingStep: 0,
      sectionId: null,
      foundationStarted: null,
      foundationCompleted: null,
      selfLevel: "unknown",
      targetScore: null,
      examDate: null,
      dailyMinutes: null,
      studyDays: [],
      aiContextConsent: false,
      onboardingCompleted: false,
    },
    selected = [],
    form = {
      id: "welcome-form",
      dataset: {},
      values: [],
      reportValidity: () => true,
      querySelector: () => ({ disabled: false }),
    };
  const catalog = {
    sections: [{ id: "qudrat", title: "القدرات" }],
    tracks: [
      {
        id: "qudrat-quant",
        title: "الكمي",
        sectionId: "qudrat",
        visible: true,
      },
      {
        id: "qudrat-verbal",
        title: "اللفظي",
        sectionId: "qudrat",
        visible: true,
      },
    ],
    instructors: Array.from({ length: 4 }, (_, i) => ({
      id: "source-" + i,
      name: "المصدر " + i,
    })),
    courses: Array.from({ length: 4 }, (_, i) => ({
      id: "choice-" + i,
      title: "دورة " + i,
      description: "محتوى منشور",
      trackId: i < 2 ? "qudrat-quant" : "qudrat-verbal",
      stage: i % 2 ? "training" : "foundation",
      instructorId: "source-" + i,
      metrics: {
        videoCount: 3,
        lessonCount: 3,
        videoSeconds: 1800,
        estimatedSeconds: 0,
        unknownVideoCount: 0,
      },
    })),
  };
  globalThis.document = {
    hidden: false,
    querySelector: (s) =>
      s === "#learning-root"
        ? root
        : s === "#welcome-form"
          ? form
          : s === "#learning-form-error"
            ? error
            : null,
    addEventListener: (name, fn) => (events[name] = fn),
    removeEventListener: (name) => delete events[name],
  };
  globalThis.FormData = class {
    constructor(f) {
      this.values = f.values || [];
    }
    get(k) {
      return this.values.find(([n]) => n === k)?.[1] ?? null;
    }
    getAll(k) {
      return this.values.filter(([n]) => n === k).map(([, v]) => v);
    }
    has(k) {
      return this.values.some(([n]) => n === k);
    }
  };
  globalThis.location = { hash: "#/welcome" };
  account.user = { id: "student", name: "طالب" };
  globalThis.fetch = async (path, options) => {
    let value;
    const body = options.body ? JSON.parse(options.body) : null;
    requests.push({ path, body });
    if (path === "/api/learning/catalog") value = catalog;
    else if (path === "/api/learning/me")
      value = { profile, selectedCourseIds: selected };
    else if (path === "/api/learning/profile") {
      profile = { ...profile, ...body };
      value = { profile };
    } else if (path === "/api/learning/selections") {
      selected = body.courseIds;
      value = { version: 1 };
    } else throw Error("Unexpected route " + path);
    return { ok: true, json: async () => structuredClone(value) };
  };
  let dispose = () => {};
  try {
    const errors = [];
    dispose = mountLearning(
      "welcome",
      null,
      (s) => errors.push(s),
      () => {},
    );
    for (let i = 0; i < 10 && !root.innerHTML.includes("welcome-form"); i++)
      await setImmediate();
    const answers = [
      ["sectionId", "qudrat"],
      ["foundationStarted", "false"],
      ["foundationCompleted", "false"],
      ["selfLevel", "intermediate"],
      ["targetScore", "95"],
      ["examDate", "2027-01-01"],
      ["hours", "2"],
      ["studyDays", "1"],
    ];
    for (let i = 0; i < 8; i++) {
      assert(root.innerHTML.includes(`خطوتك ${i + 1} من ٨`));
      assert.equal((root.innerHTML.match(/<form /g) || []).length, 1);
      form.dataset.key = root.innerHTML.match(/data-key="([^"]+)"/)[1];
      form.values =
        i === 7
          ? [
              ["studyDays", "1"],
              ["studyDays", "3"],
              ["studyDays", "5"],
            ]
          : [answers[i]];
      if (i === 4)
        await events.click({
          target: {
            closest: () => ({
              hasAttribute: (k) => k === "data-welcome-skip",
              dataset: {},
            }),
          },
        });
      else await events.submit({ target: form, preventDefault() {} });
    }
    assert.equal(profile.dailyMinutes, 120);
    assert.deepEqual(profile.studyDays, [1, 3, 5]);
    assert.equal(profile.targetScore, null);
    assert.equal(profile.aiContextConsent, false);
    assert.equal(profile.onboardingCompleted, true);
    assert.equal(location.hash, "#/choose");
    assert.deepEqual(errors, []);
    dispose();
    root.innerHTML = "";
    dispose = mountLearning(
      "choose",
      null,
      (s) => errors.push(s),
      () => {},
    );
    for (let i = 0; i < 10 && !root.innerHTML.includes("choices-form"); i++)
      await setImmediate();
    for (let i = 0; i < 4; i++) {
      assert(root.innerHTML.includes("المصدر " + i));
      events.change({
        target: { name: "courseId", value: "choice-" + i, checked: true },
      });
    }
    await events.submit({
      target: {
        id: "choices-form",
        querySelector: () => ({ disabled: false }),
      },
      preventDefault() {},
    });
    assert.deepEqual(selected, [
      "choice-0",
      "choice-1",
      "choice-2",
      "choice-3",
    ]);
    assert.equal(location.hash, "#/journey");
    assert.equal(
      requests.filter((r) => r.path === "/api/learning/profile").length,
      8,
    );
    assert.deepEqual(errors, []);
  } finally {
    dispose();
    account.user = oldUser;
    for (const k of keys)
      if (previous[k] === undefined) delete globalThis[k];
      else globalThis[k] = previous[k];
  }
});

test("learning pages retain source identity, actual clip duration, linked practice and responsive theme styles", async () => {
  const original = structuredClone(db),
    oldDoc = globalThis.document,
    oldUser = account.user;
  try {
    globalThis.document = { documentElement: { dataset: { theme: "light" } } };
    db.instructors = [
      { id: "owned-source", name: "مصدر منشور", published: true },
    ];
    const c = db.courses[0];
    c.instructorId = "owned-source";
    c.stage = "training";
    c.lessons[0].durationSeconds = 1234;
    c.lessons[0].practiceQuestionIds = ["q1", "q2"];
    const html = coursePage(c.id);
    c.groupTitle = "زبدة المصدر";
    assert.equal(courseGroupName(c), "زبدة المصدر");
    assert(teacherCard({ id: "owned-source", name: "مصدر منشور", specialty: "كمي", courseIds: [], videoCount: 0 }, "qudrat-quant").includes("#/instructor/owned-source?track=qudrat-quant"));
    assert(html.includes("مصدر منشور"));
    assert(html.includes("20:34"));
    assert(html.includes("#/pricing"));
    account.user = { id: "student", name: "طالب" };
    const lesson = lessonPage(c.id, c.lessons[0].id);
    assert(lesson.includes("questions=q1%2Cq2"));
    assert(lesson.includes('id="lesson-study"'));
    for (const kind of [
      "welcome",
      "choose",
      "journey",
      "instructors",
      "instructor",
      "track",
      "discover",
      "settings",
    ]) {
      const output = learningPage(kind);
      assert(!output.includes("undefined"));
      assert.equal((output.match(/id="learning-root"/g) || []).length, 1);
    }
    const css = await readFile(
      new URL("../dist/learning.css", import.meta.url),
      "utf8",
    );
    await transform(css, { loader: "css" });
    assert(css.includes("prefers-reduced-motion"));
    assert(/max-width:\s*640px/.test(css));
    assert(css.includes("44px"));
  } finally {
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, original);
    account.user = oldUser;
    globalThis.document = oldDoc;
  }
});

test("lesson study timer saves on hidden page and navigation without marking content mastered", async () => {
  const oldDoc = globalThis.document,
    oldFetch = globalThis.fetch,
    events = {},
    calls = [],
    clock = { textContent: "" },
    button = {
      textContent: "",
      disabled: false,
      addEventListener: (_, fn) => (events.click = fn),
      removeEventListener: () => delete events.click,
    },
    root = {
      innerHTML: "",
      querySelector: (s) => (s === "button" ? button : clock),
    };
  globalThis.document = {
    hidden: false,
    querySelector: () => root,
    addEventListener: (_, fn) => (events.hide = fn),
    removeEventListener: () => delete events.hide,
  };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return {
      ok: true,
      json: async () =>
        path.endsWith("/start")
          ? { id: "session-" + calls.length }
          : { seconds: 125 },
    };
  };
  let cleanup = () => {};
  try {
    cleanup = mountLessonStudy(() => {});
    await events.click();
    assert(button.textContent.includes("احفظ"));
    document.hidden = true;
    events.hide();
    await setImmediate();
    assert.equal(clock.textContent, "2:05");
    assert(calls[1].path.endsWith("/stop"));
    assert.equal(calls[1].options.keepalive, true);
    document.hidden = false;
    await events.click();
    cleanup();
    await setImmediate();
    assert(calls.at(-1).path.endsWith("/stop"));
    assert(!calls.some((c) => c.path.includes("/complete")));
  } finally {
    cleanup();
    globalThis.document = oldDoc;
    globalThis.fetch = oldFetch;
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setImmediate } from "node:timers/promises";
import { transform } from "esbuild";
import { db, defaults, student, setStudent } from "../dist/data.js";
import { account } from "../dist/api.js";
import { normalizeContent } from "../server/learning-model.mjs";
import { storefrontHome } from "../dist/storefront.js";
import {
  storeSectionsPage,
  storeTrackPage,
  storeTeachersPage,
  storeCoursePage,
} from "../dist/store-catalog.js";
import {
  previewLessonId,
  canReadLesson,
  afterAuthRoute,
  authLink,
  safeNext,
} from "../dist/course-policy.js";
import { storeConfig } from "../dist/store-config.js";
import { mountStoreAdmin } from "../dist/store-admin.js";
import { loadPaymentStatus } from "../dist/live-pages.js";

test("visitor storefront has the approved order, public introductions, real clip durations and no student tasks", async () => {
  const original = structuredClone(db),
    session = { ...account };
  try {
    Object.assign(db, normalizeContent(defaults));
    delete db.storefront;
    account.user = null;
    account.entitled = false;
    db.instructors = [
      {
        id: "public-source",
        name: "مدرّس محتوى منشور",
        published: true,
        sectionIds: ["qudrat"],
        specialty: "الكمي",
        bio: "نبذة من الإدارة",
      },
    ];
    const c = db.courses[0];
    c.instructorId = "public-source";
    c.access = "paid";
    c.previewLessonId = "v1";
    c.lessons = [55, 125, 302].map((n, i) => ({
      id: "v" + (i + 1),
      title: "مقطع منشور " + i,
      body: "شرح داخلي",
      durationSeconds: n,
      video: true,
      videoAssetId: "asset-" + i,
      free: true,
      visible: true,
      order: i + 1,
      locked: false,
    }));
    const home = storefrontHome(),
      ids = [
        "exams",
        "catalog",
        "features",
        "pricing",
        "faq",
      ];
    let last = -1;
    for (const id of ids) {
      const index = home.indexOf('id="' + id + '"');
      assert(index > last, id + " order");
      last = index;
    }
    for (const path of [
      "#/discover",
      "#/choose",
      "#/journey",
      "#/plan",
      "#/progress",
      "#/bank",
      "#/tutor",
      "#/lesson/",
    ])
      assert(
        !home.includes(path),
        path + " must not lead the visitor into the student app",
      );
    assert(!home.includes("plan-lines"));
    assert(!home.includes("learning-root"));
    for (const id of ["qudrat", "tahsili", "step"])
      assert(storeSectionsPage(id).length > 400);
    assert(storeSectionsPage("step").includes("قادم"));
    assert(
      storeTrackPage("qudrat-quant").includes("تأسيس أم تدريب") ||
        storeTrackPage("qudrat-quant").includes("التأسيس"),
    );
    assert(storeTeachersPage().includes("مدرّس محتوى منشور"));
    assert(
      storeTeachersPage("public-source").includes("<h1>مدرّس محتوى منشور</h1>"),
    );
    let html = storeCoursePage(c.id, "v1");
    for (const duration of ["00:55", "02:05", "05:02", "08:02"])
      assert(html.includes(duration));
    assert(!html.includes("<video"));
    assert(html.includes("إنشاء حساب مجاني"));
    assert(html.includes(authLink(true, "/course/" + c.id + "?preview=v1")));
    assert(!html.includes("/api/media/asset-0"));
    account.user = { id: "registered", role: "student" };
    html = storeCoursePage(c.id, "v1");
    assert(html.includes("<video"));
    assert(html.includes("/api/media/asset-0"));
    assert(!storeCoursePage(c.id, "v2").includes("<video"));
    c.previewLessonId = null;
    assert.equal(previewLessonId(c), null);
    assert(!storeCoursePage(c.id, "v1").includes("<video"));
    c.previewLessonId = "v2";
    assert(canReadLesson(c, c.lessons[1], account.user, false));
    assert(!canReadLesson(c, c.lessons[0], account.user, false));
    assert(!canReadLesson(c, c.lessons[1], null, true));
    db.storefront = storeConfig(db);
    db.storefront.sections.find((s) => s.id === "catalog").title =
      "<script>not executable</script>";
    assert(!storefrontHome().includes("<script>"));
    assert(storefrontHome().includes("&lt;script&gt;"));
    const css = await readFile(
      new URL("../dist/storefront-final.css", import.meta.url),
      "utf8",
    );
    await transform(css, { loader: "css" });
    assert(css.includes("prefers-reduced-motion"));
    assert(/max-width:\s*360px/.test(css));
    assert(css.includes("44px"));
    assert(css.includes("storefront-final"));
  } finally {
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, original);
    Object.assign(account, session);
  }
});

test("auth returns free visitors to their preview or order and never accepts an external redirect", () => {
  const free = { user: { role: "student" }, entitled: false },
    paid = { ...free, entitled: true };
  assert.equal(
    afterAuthRoute(free, "/course/quant-basics?preview=ratios"),
    "#/course/quant-basics?preview=ratios",
  );
  assert.equal(
    afterAuthRoute(free, "/subscription/year"),
    "#/subscription/year",
  );
  assert.equal(afterAuthRoute(free, null), "#/sections");
  assert.equal(afterAuthRoute(paid, null), "#/dashboard");
  for (const bad of [
    "https://evil.test",
    "//evil.test",
    "javascript:alert(1)",
    "/admin",
    "/course/id?preview=x&next=//evil.test",
    "/course/id%0a",
  ])
    assert.equal(safeNext(bad), null);
});

test("normal storefront editor saves titles, visibility, order, featured cards, FAQ and contact without code execution", async () => {
  const previous = {
      document: globalThis.document,
      fetch: globalThis.fetch,
      FormData: globalThis.FormData,
    },
    original = structuredClone(db),
    session = { ...account },
    events = {},
    root = {
      innerHTML: "",
      textContent: "",
      querySelector: () => ({ textContent: "" }),
    };
  let saved;
  const data = normalizeContent(defaults);
  data.revision = 3;
  data.instructors = [];
  globalThis.document = {
    querySelector: () => root,
    addEventListener: (k, fn) => (events[k] = fn),
    removeEventListener: (k) => delete events[k],
  };
  account.user = { role: "admin" };
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/admin/content");
    if (options.method === "PUT") {
      saved = JSON.parse(options.body);
      return { ok: true, json: async () => saved };
    }
    return { ok: true, json: async () => structuredClone(data) };
  };
  const v = storeConfig(data),
    entries = v.sections.flatMap((s) => [
      [s.id + "-title", s.id === "catalog" ? "نص يختاره المالك" : s.title],
      [s.id + "-eyebrow", s.eyebrow],
      [s.id + "-description", s.description],
      [s.id + "-order", s.order],
      [s.id + "-visible", "on"],
    ]);
  entries.push(
    ["foundation", "وصف أساس"],
    ["training", "وصف تدريب"],
    ["supportEmail", "owner@example.test"],
    ["faqQuestion", "سؤال من المالك"],
    ["faqAnswer", "إجابة محفوظة"],
    ["featuredCourseIds", data.courses[0].id],
  );
  globalThis.FormData = class {
    get(k) {
      return entries.find(([n]) => n === k)?.[1] ?? null;
    }
    getAll(k) {
      return entries.filter(([n]) => n === k).map(([, v]) => v);
    }
    has(k) {
      return entries.some(([n]) => n === k);
    }
  };
  const dispose = mountStoreAdmin(() => {});
  try {
    for (
      let i = 0;
      i < 10 && !root.innerHTML.includes("store-content-form");
      i++
    )
      await setImmediate();
    assert(root.innerHTML.includes("قسم مستقل"));
    const button = { disabled: false };
    await events.submit({
      target: { id: "store-content-form", querySelector: () => button },
      preventDefault() {},
    });
    assert.equal(
      saved.storefront.sections.find((s) => s.id === "catalog").title,
      "نص يختاره المالك",
    );
    assert.equal(saved.storefront.supportEmail, "owner@example.test");
    assert.deepEqual(saved.storefront.faq, [
      ["سؤال من المالك", "إجابة محفوظة"],
    ]);
    assert.equal(button.disabled, false);
  } finally {
    dispose();
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, original);
    Object.assign(account, session);
    Object.assign(globalThis, previous);
  }
});

test("payment UI enters the student app only after a live verified and entitled server response", async () => {
  const previous = {
      document: globalThis.document,
      fetch: globalThis.fetch,
      location: globalThis.location,
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
    },
    original = structuredClone(db),
    oldStudent = structuredClone(student),
    session = { ...account };
  try {
    for (const [status, mode, entitled, redirect] of [
      ["pending", "live", false, false],
      ["failed", "live", false, false],
      ["paid", "test", false, false],
      ["paid", "live", false, false],
      ["paid", "live", true, true],
    ]) {
      const target = { innerHTML: "", isConnected: true },
        timers = [];
      globalThis.document = { querySelector: () => target };
      globalThis.location = { hash: "#/payment/success?order=owned-order" };
      globalThis.setTimeout = (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length;
      };
      globalThis.clearTimeout = () => {};
      globalThis.fetch = async (path) => ({
        ok: true,
        json: async () =>
          path.startsWith("/api/orders/")
            ? {
                order: { id: "owned-order", amount: 9999, status, mode },
                entitled,
              }
            : path === "/api/content"
              ? structuredClone(original)
              : {
                  user: { id: "owner", role: "student" },
                  csrf: "csrf",
                  entitled,
                  student: {},
                  learning: { profile: { onboardingCompleted: true } },
                },
      });
      const cleanup = await loadPaymentStatus(() => {});
      assert.equal(
        timers.some((t) => t.ms === 1800),
        redirect,
      );
      if (redirect) {
        assert(target.innerHTML.includes("إلى منصة الطالب"));
        timers.find((t) => t.ms === 1800).fn();
        assert.equal(location.hash, "#/dashboard");
      } else assert(!target.innerHTML.includes("إلى منصة الطالب"));
      cleanup();
    }
  } finally {
    Object.assign(globalThis, previous);
    for (const k of Object.keys(db)) delete db[k];
    Object.assign(db, original);
    setStudent(oldStudent);
    Object.assign(account, session);
  }
});

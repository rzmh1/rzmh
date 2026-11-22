import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
import { db } from "../dist/data.js";
import {
  storefrontHome,
  updatesPage,
  dailyUpdates,
  savings,
  mountStorefront,
  subscriptionSection,
} from "../dist/storefront.js";
import { logo } from "../dist/ui.js";

test("storefront uses actual content, honest update states and fixed arithmetic for all durations", async () => {
  const before = structuredClone(db.updates),
    courses = structuredClone(db.courses),
    tests = structuredClone(db.tests || []);
  try {
    db.updates = [];
    assert(dailyUpdates().includes("لا يوجد محتوى منشور حاليًا"));
    assert(!dailyUpdates().includes("<time"));
    const home = storefrontHome();
    for (const price of ["19.99", "39.99", "59.99", "99.99"])
      assert(home.includes(price));
    // The current storefront describes included tools without opening student routes.
    for (const route of ["#/scratch", "#/mistakes", "#/journey", "#/bank"])
      assert(!home.includes(`href="${route}"`));
    assert(home.includes("why-card"));
    assert(!home.includes("بدايات صغيرة"));
    const annual = db.plans.find((p) => p.months === 12);
    assert.equal(savings(annual).amount, 139.89);
    assert(Math.abs(savings(annual).percent - 58.317) < 0.001);
    assert.equal(savings(db.plans.find((p) => p.months === 3)).amount, 19.98);
    assert.equal(savings(db.plans.find((p) => p.months === 6)).amount, 59.95);
    assert(subscriptionSection().includes("٥٨٫٣٪"));
    db.tests = [
      { id: "actual-daily-test", title: "اختبار منشور للتحديث", visible: true },
    ];
    db.updates = [
      {
        id: "actual-update",
        title: "تحديث محفوظ في البيانات",
        type: "التجميعات اليومية",
        body: "محتوى ناشره المالك",
        updatedAt: "2026-11-15T10:00:00Z",
        testId: "actual-daily-test",
      },
    ];
    const feed = dailyUpdates();
    assert(feed.includes("تحديث محفوظ"));
    assert(feed.includes("2026-11-15T10:00:00Z"));
    assert(feed.includes("#/pricing"));
    assert(feed.includes("ضمن الاشتراك"));
    db.tests[0].visible = false;
    assert(!dailyUpdates().includes("#/tests/actual-daily-test"));
    db.updates[0].visible = false;
    assert(!dailyUpdates().includes("<time"));
    db.courses = [];
    assert(storefrontHome().includes("الدورات قيد الإعداد"));
  } finally {
    db.updates = before;
    db.courses = courses;
    db.tests = tests;
  }
  const css = await readFile(
    new URL("../dist/storefront.css", import.meta.url),
    "utf8",
  );
  await transform(css, { loader: "css" });
  assert(/max-width:\s*360px/.test(css));
  assert(/max-width:\s*480px/.test(css));
  assert(/max-width:\s*760px/.test(css));
  assert(css.includes("prefers-reduced-motion"));
  assert(/data-theme=["']?dark/.test(css));
  const app = await readFile(
    new URL("../dist/app.js", import.meta.url),
    "utf8",
  );
  assert(app.includes('case "updates":'));
  assert(app.includes("mountStorefront"));
});

test("feed filters and course tabs work with keyboard navigation without network or database writes", () => {
  const previousDoc = globalThis.document,
    oldUpdates = db.updates,
    oldTests = db.tests;
  const events = {},
    tabs = [];
  const classList = () => ({ toggle() {} });
  const feedButtons = [
    "all",
    "collections",
    "tests",
    "weekly",
    "questions",
  ].map((id) => ({
    dataset: { feedFilter: id },
    classList: classList(),
    setAttribute(k, v) {
      this[k] = v;
    },
  }));
  const panel = {
    innerHTML: "",
    setAttribute(k, v) {
      this[k] = v;
    },
  };
  const spot = {
    innerHTML: "",
    setAttribute(k, v) {
      this[k] = v;
    },
  };
  globalThis.document = {
    addEventListener(type, fn) {
      events[type] = fn;
    },
    removeEventListener(type) {
      delete events[type];
    },
    querySelectorAll(selector) {
      return selector === "[data-feed-filter]" ? feedButtons : tabs;
    },
    querySelector(selector) {
      if (selector === "#daily-feed-panel") return panel;
      if (selector === "#course-spotlight") return spot;
      return null;
    },
  };
  const cleanup = mountStorefront();
  try {
    db.updates = [];
    const weekly = feedButtons.find((b) => b.dataset.feedFilter === "weekly");
    events.click({
      target: {
        closest(s) {
          return s === "[data-feed-filter]" ? weekly : null;
        },
      },
    });
    assert(panel.innerHTML.includes("لم يُنشر ملخص"));
    assert.equal(weekly["aria-pressed"], true);
    db.tests = [
      { id: "linked-live-test", title: "اختبار مرتبط", visible: true },
    ];
    const test = db.tests[0];
    if (test) {
      db.updates = [
        {
          id: "u",
          type: "التجميعات اليومية",
          title: "تحديث باختبار",
          body: "محتوى",
          updatedAt: "2026-11-15",
          testId: test.id,
        },
      ];
      const button = feedButtons.find((b) => b.dataset.feedFilter === "tests");
      events.click({
        target: {
          closest(s) {
            return s === "[data-feed-filter]" ? button : null;
          },
        },
      });
      assert(panel.innerHTML.includes("تحديث باختبار"));
    }
    for (const c of db.courses.slice(0, 2)) {
      const tab = {
        id: "course-tab-" + c.id,
        dataset: { coursePreview: c.id },
        classList: classList(),
        setAttribute(k, v) {
          this[k] = v;
        },
        focus() {
          this.focused = true;
        },
        click() {
          events.click({
            target: {
              closest(s) {
                return s === "[data-course-preview]" ? tab : null;
              },
            },
          });
        },
      };
      tabs.push(tab);
    }
    if (tabs.length > 1) {
      let prevented = false;
      events.keydown({
        key: "ArrowLeft",
        target: {
          closest() {
            return tabs[0];
          },
        },
        preventDefault() {
          prevented = true;
        },
      });
      assert(prevented);
      assert(tabs[1].focused);
      assert.equal(tabs[1]["aria-selected"], true);
      assert(spot.innerHTML.includes(db.courses[1].title));
    }
  } finally {
    cleanup();
    globalThis.document = previousDoc;
    db.updates = oldUpdates;
    db.tests = oldTests;
  }
});

test("uploaded logo remains the same source and critical foreground pairs meet WCAG text contrast", () => {
  const previous = db.brand.logo,
    previousDark = db.brand.logoDark;
  try {
    db.brand.logo = "https://example.test/original-logo.png";
    assert(logo().includes('src="https://example.test/original-logo.png"'));
    assert(!logo().includes("logo-mark"));
    db.brand.logoDark = "https://example.test/original-logo-dark.png";
    assert(logo().includes("original-logo-dark.png"));
    assert(logo().includes("original-logo.png"));
  } finally {
    db.brand.logo = previous;
    db.brand.logoDark = previousDark;
  }
  const rgb = (hex) =>
    hex
      .match(/[\da-f]{2}/gi)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = (hex) =>
    rgb(hex).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const [a, b] of [
    ["ffffff", "7460d4"],
    ["706a7c", "fbfaf7"],
    ["b6adbf", "171623"],
    ["b8a2ff", "171623"],
    ["ffffff", "7154bc"],
  ])
    assert(contrast(a, b) >= 4.5, `${a}/${b}`);
});

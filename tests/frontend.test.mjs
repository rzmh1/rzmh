import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

test("store, routes, mobile styles, paid lesson gate, owner workspace and payment review render without stale demo flows", async () => {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
  };
  globalThis.document = {
    querySelector() {
      return {};
    },
    documentElement: { dataset: { theme: "light" } },
  };
  const data = await import("../dist/data.js"),
    pages = await import("../dist/pages.js"),
    ui = await import("../dist/ui.js"),
    live = await import("../dist/live-pages.js"),
    { account } = await import("../dist/api.js");
  globalThis.location = { hash: "#/reset-password?email=student%40example.test" };
  const html = pages.home();
  assert(!html.includes("بدايات صغيرة"));
  assert(!html.includes("learning-section"));
  assert(html.includes("استكشف الأقسام"));
  assert(!html.includes("#/discover"));
  assert(html.includes("اشترك في رُزمة"));
  const signupHtml = live.authLive(true);
  const loginHtml = live.authLive();
  const resetHtml = live.resetPasswordLive();
  assert(signupHtml.includes('minlength="8"'));
  assert(signupHtml.includes("٨ أحرف على الأقل"));
  assert(!signupHtml.includes("١٢ حرفًا"));
  assert(!loginHtml.includes('minlength="8"'));
  assert(loginHtml.includes("كلمة المرور المرتبطة بحسابك"));
  assert(resetHtml.includes('minlength="8"'));
  assert(resetHtml.includes("٨ أحرف"));
  for (const price of ["19.99", "39.99", "59.99", "99.99"])
    assert(html.includes(price));
  const css = await readFile(
    new URL("../dist/styles.css", import.meta.url),
    "utf8",
  );
  await transform(css, { loader: "css" });
  assert(css.includes("viewport") || css.includes("safe-area-inset"));
  assert(/@media\s*\(max-width:\s*480px\)/.test(css));
  assert(!css.includes(".learning-section"));
  const fixtures = [
    html,
    pages.pricing(),
    pages.sectionsPage(),
    ...data.db.sections.map((s) => pages.sectionsPage(s.id)),
    ...data.db.courses.map((c) => pages.coursePage(c.id)),
    ...data.db.courses.flatMap((c) =>
      c.lessons.map((l) => pages.lessonPage(c.id, l.id)),
    ),
    pages.dashboard(),
    pages.bankPage(),
    pages.planPage(),
    pages.progressPage(),
    pages.mistakesPage(),
    pages.testsPage(),
    pages.resultsPage(),
    pages.scratchPage(),
    live.authLive(),
    live.authLive(true),
    live.adminAuthLive(),
    live.reviewOrder("year"),
    live.paymentStatus(true),
    live.paymentStatus(false),
    live.tutorLive(),
    pages.aboutPage(),
  ];
  for (const [i, s] of fixtures.entries()) {
    assert(s.length > 100, `empty page ${i}`);
    assert(!s.includes("undefined"), `undefined on ${i}`);
    const ids = [...s.matchAll(/(?:^|\s)id="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(ids.length, new Set(ids).size, `duplicate id on ${i}`);
  }
  data.db.courses[0].lessons[0].locked = true;
  assert(pages.lessonPage("quant-basics", "ratios").includes("شاهد الاشتراك"));
  data.db.courses[0].lessons[0].locked = false;
  assert(!ui.footer().includes('href="#/admin"'));
  account.user = { role: "admin" };
  assert(ui.footer().includes('href="#/admin"'));
  const { adminPage } = await import("../dist/admin.js");
  assert(adminPage().includes("لوحة المعلومات"));
  assert(adminPage().includes("التخصيص المتقدم"));
  account.user = null;
  const index = await readFile(
    new URL("../dist/index.html", import.meta.url),
    "utf8",
  );
  assert(index.includes("viewport-fit=cover"));
  assert(!/<script>(.|\n)*?<\/script>/.test(index));
  assert(index.includes('dir="rtl"'));
  console.log(
    `Rendered ${fixtures.length} page states; CSS parsed, routes/IDs checked. This is not browser visual QA.`,
  );
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../server/config.mjs";
import { openDatabase } from "../server/database.mjs";
import {
  listSupportCategories,
  createSupportQuestion,
  listStudentSupportQuestions,
  listPublishedSupportAnswers,
  listSupportForAdmin,
  replySupportQuestion,
  updateSupportQuestionStatus,
  upsertSupportCategory,
} from "../server/support.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-support-"));
  const cfg = config({
    DATA_DIR: dir,
    APP_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: "http://127.0.0.1:3000",
  });
  const store = openDatabase(cfg);
  const student = { id: randomUUID(), role: "student", name: "طالب رُزمة" };
  const other = { id: randomUUID(), role: "student", name: "طالب آخر" };
  const admin = { id: randomUUID(), role: "admin", name: "مالك رُزمة" };
  const free = { id: randomUUID(), role: "student", name: "حساب مجاني" };
  for (const user of [student, other, admin, free]) {
    store.db.prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)"
    ).run(user.id, user.id + "@example.test", user.name, "test-hash", user.role, new Date().toISOString());
  }
  const start = new Date(Date.now() - 60000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  for (const user of [student, other]) {
    store.db.prepare(
      "INSERT INTO subscriptions(id,user_id,plan_id,start_at,end_at,status,order_id) VALUES(?,?,?,?,?,'active',NULL)"
    ).run(randomUUID(), user.id, "month", start, end);
  }
  return {
    store, student, other, admin, free,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("student inquiries remain private until owner replies and explicitly publishes", async () => {
  const f = await fixture();
  try {
    const categories = listSupportCategories(f.store, f.student);
    assert.ok(categories.some((c) => c.id === "leaks"));
    const created = createSupportQuestion(f.store, f.student, {
      categoryId: "leaks",
      subject: "متى تنزل تحديثات التسريبات؟",
      body: "أريد معرفة مواعيد تحديث التسريبات الجديدة في المنصة.",
    });
    assert.equal(created.status, "pending");
    assert.equal(listPublishedSupportAnswers(f.store, f.other).length, 0);
    assert.equal(listStudentSupportQuestions(f.store, f.student).length, 1);
    assert.equal(listStudentSupportQuestions(f.store, f.other).length, 0);

    replySupportQuestion(f.store, f.admin, created.id, {
      reply: "التحديثات تنزل في الساعة 12 ظهرًا و9 مساءً.",
      publish: false,
    });
    const own = listStudentSupportQuestions(f.store, f.student);
    assert.equal(own[0].status, "replied");
    assert.equal(own[0].published, 0);
    assert.match(own[0].reply, /12 ظهرًا/);
    assert.equal(listPublishedSupportAnswers(f.store, f.other).length, 0);

    replySupportQuestion(f.store, f.admin, created.id, {
      reply: "التحديثات تنزل في الساعة 12 ظهرًا و9 مساءً.",
      publish: true,
    });
    const publicAnswers = listPublishedSupportAnswers(f.store, f.other);
    assert.equal(publicAnswers.length, 1);
    assert.equal(publicAnswers[0].subject, "متى تنزل تحديثات التسريبات؟");
    assert.equal(publicAnswers[0].reply, "التحديثات تنزل في الساعة 12 ظهرًا و9 مساءً.");
    assert.equal(listSupportForAdmin(f.store).questions.length, 1);
  } finally {
    await f.close();
  }
});

test("owner can manage categories and close or reject questions", async () => {
  const f = await fixture();
  try {
    const createdCategory = upsertSupportCategory(f.store, f.admin, {
      name: "مواعيد الاختبارات",
      active: true,
    });
    assert.ok(createdCategory.id);
    assert.ok(listSupportCategories(f.store, f.student).some((c) => c.id === createdCategory.id));
    upsertSupportCategory(f.store, f.admin, {
      id: createdCategory.id,
      name: "المواعيد",
      active: false,
    });
    assert.ok(!listSupportCategories(f.store, f.student).some((c) => c.id === createdCategory.id));

    const question = createSupportQuestion(f.store, f.student, {
      categoryId: "general",
      subject: "استفسار عن الاشتراك",
      body: "أحتاج إلى معرفة تفاصيل الاشتراك وموعد انتهائه.",
    });
    updateSupportQuestionStatus(f.store, f.admin, question.id, { status: "rejected" });
    assert.equal(listStudentSupportQuestions(f.store, f.student)[0].status, "rejected");
    assert.equal(listPublishedSupportAnswers(f.store, f.other).length, 0);
  } finally {
    await f.close();
  }
});

test("support is restricted to active subscribers and validates submissions", async () => {
  const f = await fixture();
  try {
    assert.throws(
      () => listSupportCategories(f.store, f.free),
      (err) => err.status === 403,
    );
    assert.throws(
      () => createSupportQuestion(f.store, f.student, {
        categoryId: "missing",
        subject: "استفسار واضح",
        body: "هذا نص استفسار واضح وكافٍ.",
      }),
      (err) => err.status === 400,
    );
    assert.throws(
      () => createSupportQuestion(f.store, f.student, {
        categoryId: "general",
        subject: "سؤال",
        body: "قصير",
      }),
      (err) => err.status === 400,
    );
  } finally {
    await f.close();
  }
});

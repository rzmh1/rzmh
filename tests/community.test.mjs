import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { config } from "../server/config.mjs";
import { openDatabase } from "../server/database.mjs";
import {
  listCommunityPosts,
  getCommunityPost,
  createCommunityPost,
  answerCommunityPost,
  acceptCommunityAnswer,
  reportCommunityContent,
  listCommunityForAdmin,
  moderateCommunityPost,
  moderateCommunityAnswer,
} from "../server/community.mjs";

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-community-"));
  const cfg = config({
    DATA_DIR: dir,
    APP_KEY: randomBytes(32).toString("base64"),
    APP_ORIGIN: "http://127.0.0.1:3000",
  });
  const store = openDatabase(cfg);
  const owner = { id: randomUUID(), role: "student", name: "صاحب السؤال" };
  const helper = { id: randomUUID(), role: "student", name: "مجيب" };
  const admin = { id: randomUUID(), role: "admin", name: "مالك رُزمة" };
  const free = { id: randomUUID(), role: "student", name: "حساب مجاني" };
  for (const user of [owner, helper, admin, free]) {
    store.db.prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,?,?)"
    ).run(user.id, user.id + "@example.test", user.name, "test-hash", user.role, new Date().toISOString());
  }
  const start = new Date(Date.now() - 60000).toISOString();
  const end = new Date(Date.now() + 86400000).toISOString();
  for (const user of [owner, helper]) {
    store.db.prepare(
      "INSERT INTO subscriptions(id,user_id,plan_id,start_at,end_at,status,order_id) VALUES(?,?,?,?,?,'active',NULL)"
    ).run(randomUUID(), user.id, "month", start, end);
  }
  return {
    store, owner, helper, admin, free,
    close: async () => {
      store.close();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

test("subscriber community supports questions, answers, accepted answers, reports and moderation", async () => {
  const f = await fixture();
  try {
    const created = createCommunityPost(f.store, f.owner, {
      track: "qudrat",
      subject: "quantitative",
      title: "كيف أحل التناسب العكسي؟",
      body: "أفهم التناسب الطردي لكن لا أعرف كيف أميز العكسي.",
    });
    assert.equal(created.status, "visible");
    const feed = listCommunityPosts(f.store, f.helper, { track: "qudrat", subject: "quantitative" });
    assert.equal(feed.length, 1);
    assert.equal(feed[0].author_name, f.owner.name);

    const answer = answerCommunityPost(f.store, f.helper, created.id, {
      body: "إذا زادت الكمية الأولى ونقصت الثانية بالنسبة نفسها فالعلاقة عكسية.",
    });
    assert.equal(answer.status, "visible");
    let detail = getCommunityPost(f.store, f.owner, created.id);
    assert.equal(detail.answers.length, 1);
    assert.equal(detail.answers[0].author_name, f.helper.name);

    assert.throws(
      () => acceptCommunityAnswer(f.store, f.helper, created.id, answer.id),
      (err) => err.status === 403,
    );
    assert.equal(acceptCommunityAnswer(f.store, f.owner, created.id, answer.id).acceptedAnswerId, answer.id);
    detail = getCommunityPost(f.store, f.owner, created.id);
    assert.equal(detail.answers[0].accepted, 1);

    reportCommunityContent(f.store, f.helper, {
      targetType: "post", targetId: created.id, reason: "wrong",
    });
    assert.throws(
      () => reportCommunityContent(f.store, f.helper, {
        targetType: "post", targetId: created.id, reason: "wrong",
      }),
      (err) => err.status === 409,
    );

    const adminRows = listCommunityForAdmin(f.store);
    assert.equal(adminRows.length, 1);
    assert.equal(adminRows[0].report_count, 1);
    moderateCommunityAnswer(f.store, f.admin, answer.id, { status: "hidden" });
    detail = getCommunityPost(f.store, f.owner, created.id);
    assert.equal(detail.answers.length, 0);

    moderateCommunityPost(f.store, f.admin, created.id, { status: "hidden" });
    assert.throws(
      () => getCommunityPost(f.store, f.owner, created.id),
      (err) => err.status === 404,
    );
    moderateCommunityPost(f.store, f.admin, created.id, { status: "visible" });
    assert.equal(getCommunityPost(f.store, f.owner, created.id).post.status, "visible");
  } finally {
    await f.close();
  }
});

test("community is restricted to active subscribers and excludes inactive study tracks", async () => {
  const f = await fixture();
  try {
    assert.throws(
      () => listCommunityPosts(f.store, f.free),
      (err) => err.status === 403,
    );
    assert.throws(
      () => createCommunityPost(f.store, f.owner, {
        track: "step",
        subject: "english",
        title: "سؤال في اللغة الإنجليزية",
        body: "هذا المسار غير مفعل حاليًا.",
      }),
      (err) => err.status === 400,
    );
    assert.throws(
      () => createCommunityPost(f.store, f.owner, {
        track: "qudrat",
        subject: "quantitative",
        title: "سؤال",
        body: "قصير",
      }),
      (err) => err.status === 400,
    );
  } finally {
    await f.close();
  }
});

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { DatabaseSync } from "node:sqlite";
import { createApp } from "../server/index.mjs";
import { openDatabase, saveContent } from "../server/database.mjs";
import { config } from "../server/config.mjs";
import { passwordHash } from "../server/security.mjs";
import { learningService } from "../server/learning.mjs";
import { todayKey, addDays } from "../server/learning-model.mjs";
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-learning-")),
    cfg = config({
      DATA_DIR: dir,
      APP_KEY: randomBytes(32).toString("base64"),
      APP_ORIGIN: "http://127.0.0.1:3000",
    }),
    app = createApp(cfg);
  app.server.listen(0, "127.0.0.1");
  await once(app.server, "listening");
  cfg.origin = "http://127.0.0.1:" + app.server.address().port;
  const id = randomUUID();
  app.store.db
    .prepare(
      "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?,'admin',?)",
    )
    .run(
      id,
      "learning-owner@example.test",
      "مالك الاختبار",
      await passwordHash("owner-test-password-123"),
      new Date().toISOString(),
    );
  return {
    ...app,
    cfg,
    dir,
    async close() {
      app.server.close();
      await once(app.server, "close");
      await rm(dir, { recursive: true, force: true });
    },
  };
}
function client(f) {
  let cookie = "",
    csrf = "";
  return {
    async req(path, method = "GET", body) {
      const r = await fetch(f.cfg.origin + path, {
        method,
        headers: {
          Origin: f.cfg.origin,
          ...(cookie ? { Cookie: cookie } : {}),
          ...(csrf ? { "X-CSRF-Token": csrf } : {}),
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const value = await r.json().catch(() => null);
      if (r.headers.get("set-cookie"))
        cookie = r.headers.get("set-cookie").split(";")[0];
      if (value?.csrf) csrf = value.csrf;
      return { status: r.status, value };
    },
    async ok(path, method = "GET", body) {
      const r = await this.req(path, method, body);
      assert.equal(r.status, 200, path + ": " + JSON.stringify(r.value));
      return r.value;
    },
  };
}
test("real student journey: dynamic instructors, independent four-stage choices, timed plans, extra work, persistence and assessments", async () => {
  const f = await fixture();
  try {
    const owner = client(f),
      student = client(f),
      other = client(f);
    await owner.ok("/api/auth/login", "POST", {
      email: "learning-owner@example.test",
      password: "owner-test-password-123",
    });
    const registered = await student.ok("/api/auth/register", "POST", {
      email: "learning-student@example.test",
      name: "طالب الخطة",
      password: "student-test-password-123",
    });
    assert.equal(
      (await student.req("/api/admin/learning/instructors")).status,
      403,
    );
    const teacherIds = [];
    for (let i = 0; i < 5; i++) {
      const r = await owner.ok("/api/admin/learning/instructors", "POST", {
        name: "مصدر اختبار " + i,
        bio: "بيانات اختبار آلي، لا تُنشر في الحزمة",
        specialty: i % 2 ? "لفظي" : "كمي",
        kind: i === 4 ? "source" : "teacher",
        published: true,
        sectionIds: ["qudrat"],
      });
      teacherIds.push(r.id);
    }
    assert.equal((await student.ok("/api/instructors")).total, 5);
    let c = await owner.ok("/api/admin/content");
    const selected = [];
    for (const [i, [track, subject, stage]] of [
      ["qudrat-quant", "كمي", "foundation"],
      ["qudrat-quant", "كمي", "training"],
      ["qudrat-verbal", "لفظي", "foundation"],
      ["qudrat-verbal", "لفظي", "training"],
    ].entries()) {
      const id = "learning-course-" + i;
      selected.push(id);
      const lessons = [];
      for (let j = 0; j < 8; j++) {
        const asset = "learning-asset-" + i + "-" + j;
        f.store.db
          .prepare(
            "INSERT INTO assets(id,owner_id,name,mime,size,storage,object_key,status,public,duration_seconds,created_at) VALUES(?,?,?,?,?,?,?,'ready',0,?,?)",
          )
          .run(
            asset,
            f.store.db.prepare("SELECT id FROM users WHERE role='admin'").get()
              .id,
            "metadata-fixture.mp4",
            "video/mp4",
            1,
            "local",
            asset + ".mp4",
            1200,
            new Date().toISOString(),
          );
        lessons.push({
          id: "learning-lesson-" + i + "-" + j,
          title: "درس " + j,
          body: "شرح",
          free: true,
          visible: true,
          videoAssetId: asset,
          durationSeconds: 999999,
          topicId: "ratio",
          order: j + 1,
          questionId: track === "qudrat-quant" ? "q1" : "q2",
        });
      }
      c.courses.push({
        id,
        title: "دورة " + i,
        description: "دورة للاختبار الآلي",
        subject,
        sectionId: "qudrat",
        trackId: track,
        stage,
        instructorId: teacherIds[i],
        visible: true,
        order: 10 + i,
        status: "اختبار آلي",
        access: "free",
        art: "math",
        lessons,
      });
    }
    c = await owner.ok("/api/admin/content", "PUT", c);
    assert.equal(
      c.courses.find((c) => c.id === selected[0]).lessons[0].durationSeconds,
      1200,
    );
    const steps = [
      { sectionId: "qudrat" },
      { foundationStarted: true },
      { foundationCompleted: false },
      { selfLevel: "beginner" },
      { targetScore: 95 },
      { examDate: addDays(todayKey(), 21) },
      { dailyMinutes: 120 },
      {
        studyDays: [0, 1, 2, 3, 4, 5, 6],
        onboardingCompleted: true,
        aiContextConsent: false,
      },
    ];
    for (const [i, value] of steps.entries())
      await student.ok("/api/learning/profile", "PUT", {
        ...value,
        onboardingStep: Math.min(7, i),
      });
    const first = await student.ok("/api/learning/selections", "PUT", {
      courseIds: selected,
    });
    assert.equal(first.summary.selectedCourses, 4);
    assert(first.tasks.some((t) => t.track_id === "qudrat-quant"));
    assert(first.tasks.some((t) => t.track_id === "qudrat-verbal"));
    assert(first.summary.days.every((d) => d.scheduledSeconds <= 7200));
    const catalog = await student.ok("/api/learning/catalog");
    assert.equal(
      new Set(
        catalog.courses
          .filter((c) => selected.includes(c.id))
          .map((c) => c.instructorId),
      ).size,
      4,
    );
    const future = first.tasks.find(
      (t) => t.kind === "watch" && t.scheduled_date > todayKey(),
    );
    assert(future);
    await student.ok(
      "/api/learning/tasks/" + future.id + "/complete",
      "POST",
      {},
    );
    let progress = await student.ok("/api/learning/progress");
    assert(progress.today.extraTasks >= 1);
    assert(progress.courses.some((c) => c.watchedLessons > 0));
    assert.equal(
      progress.mastery.length,
      0,
      "watching must not create mastery data",
    );
    await student.ok("/api/practice", "POST", {
      id: future.track_id === "qudrat-quant" ? "q1" : "q2",
      choice: 1,
    });
    const practicePlan = await student.ok("/api/learning/plan");
    assert.equal(
      practicePlan.tasks.filter(
        (t) => t.kind === "practice" && t.status === "completed",
      ).length,
      1,
      "one answer cannot complete all repeated practice tasks",
    );
    const otherWatch = practicePlan.tasks.find(
      (t) =>
        t.kind === "watch" &&
        t.status === "pending" &&
        t.lesson_id !== future.lesson_id,
    );
    await student.ok(
      `/api/learning/lessons/${otherWatch.course_id}/${otherWatch.lesson_id}/complete`,
      "POST",
      {},
    );
    const directPlan = await student.ok("/api/learning/plan");
    assert(
      directPlan.tasks
        .filter(
          (t) => t.lesson_id === otherWatch.lesson_id && t.kind === "watch",
        )
        .every((t) => t.status === "completed"),
      "direct lesson completion reconciles planned segments",
    );
    await student.ok("/api/learning/profile", "PUT", { dailyMinutes: 240 });
    let bigger = await student.ok("/api/learning/plan");
    assert(bigger.summary.days.every((d) => d.scheduledSeconds <= 14400));
    assert(bigger.summary.completedTodaySeconds > 0);
    assert.equal(
      bigger.summary.days[0].capacitySeconds,
      14400 - bigger.summary.completedTodaySeconds,
    );
    const stale = { ...bigger.summary, generatedFor: addDays(todayKey(), -3) };
    f.store.db
      .prepare("UPDATE learning_plans SET summary=? WHERE user_id=?")
      .run(JSON.stringify(stale), registered.user.id);
    f.store.db
      .prepare(
        "UPDATE learning_tasks SET scheduled_date=? WHERE user_id=? AND status='pending'",
      )
      .run(addDays(todayKey(), -1), registered.user.id);
    const caughtUp = await student.ok("/api/learning/plan");
    assert(caughtUp.version > bigger.version);
    assert(
      caughtUp.tasks
        .filter((t) => t.status === "pending" && t.scheduled_date)
        .every((t) => t.scheduled_date >= todayKey()),
    );
    await student.ok("/api/learning/profile", "PUT", {
      dailyMinutes: 120,
      examDate: addDays(todayKey(), 1),
    });
    let tight = await student.ok("/api/learning/plan");
    assert.equal(tight.summary.feasible, false);
    assert(tight.summary.remainingSeconds > 0);
    assert(tight.summary.days.every((d) => d.scheduledSeconds <= 7200));
    progress = await student.ok("/api/learning/progress");
    assert(
      progress.courses.some((c) => c.watchedLessons > 0),
      "rescheduling preserves progress",
    );
    const session = await student.ok("/api/learning/study/start", "POST", {});
    const ago = Date.now() - 120000;
    f.store.db
      .prepare(
        "UPDATE learning_study_sessions SET started=?,last_seen=? WHERE id=?",
      )
      .run(ago, ago, session.id);
    const stopped = await student.ok(
      "/api/learning/study/" + session.id + "/stop",
      "POST",
      {},
    );
    assert.equal(
      stopped.seconds,
      30,
      "closed tabs cannot accrue hours without heartbeats",
    );
    const self = (await student.ok("/api/session")).user;
    const service = learningService(f.store);
    assert.equal(service.permittedContext(self), null);
    await student.ok("/api/learning/profile", "PUT", {
      aiContextConsent: true,
    });
    const context = service.permittedContext(self);
    assert(context.remainingToday);
    assert(!JSON.stringify(context).includes(self.email));
    assert(!JSON.stringify(context).includes("password"));
    await student.ok("/api/practice", "POST", { id: "q3", choice: 0 });
    assert(
      service
        .permittedContext(self)
        .recentMistakes.some(
          (m) => m.questionId === "q3" && m.source === "graded-practice",
        ),
    );
    c = await owner.ok("/api/admin/content");
    for (let i = 0; i < 4; i++)
      c.questions.push({
        id: "learning-q-" + i,
        sectionId: "qudrat",
        trackId: "qudrat-quant",
        subject: "كمي",
        topicId: "ratio",
        difficulty: "تأسيس",
        access: "free",
        text: "سؤال اختبار آلي " + i,
        options: ["أ", "ب", "ج", "د"],
        correct: 1,
        explanation: "شرح اختبار",
      });
    const ids = [
      "q1",
      "learning-q-0",
      "learning-q-1",
      "learning-q-2",
      "learning-q-3",
    ];
    c.tests.push({
      id: "learning-topic",
      title: "اختبار الموضوع",
      level: "topic",
      trackIds: ["qudrat-quant"],
      courseId: selected[0],
      topicId: "ratio",
      duration: 600,
      points: 1,
      visible: true,
      access: "free",
      questionIds: ids,
    });
    c.tests.push({
      id: "learning-weekly",
      title: "قياس أسبوعي",
      level: "weekly",
      trackIds: ["qudrat-quant", "qudrat-verbal"],
      duration: 600,
      points: 1,
      visible: true,
      access: "free",
      questionIds: ["q1", "q2"],
    });
    c = await owner.ok("/api/admin/content", "PUT", c);
    const invalid = structuredClone(c);
    invalid.tests.find((t) => t.id === "learning-topic").questionIds = ["q1"];
    assert.equal(
      (await owner.req("/api/admin/content", "PUT", invalid)).status,
      400,
    );
    c = await owner.ok("/api/admin/content");
    c.updates.push({
      id: "licensed-update",
      title: "تحديث للاختبار الآلي",
      body: "محتوى اختبار",
      type: "الدروس الجديدة",
      updatedAt: new Date().toISOString(),
      visible: true,
      courseId: selected[0],
      lessonId: "learning-lesson-0-0",
      sectionId: "qudrat",
      testId: "learning-topic",
    });
    assert.equal((await owner.req("/api/admin/content", "PUT", c)).status, 400);
    c.updates.at(-1).rightsConfirmed = true;
    await owner.ok("/api/admin/content", "PUT", c);
    assert(
      (await student.ok("/api/content")).updates.some(
        (u) => u.id === "licensed-update",
      ),
    );
    const attempt = await student.ok("/api/tests/start", "POST", {
      id: "learning-topic",
    });
    for (const q of attempt.questions)
      await student.ok("/api/attempts/" + attempt.id + "/answer", "POST", {
        id: q.id,
        choice: 0,
      });
    await student.ok("/api/attempts/" + attempt.id + "/finish", "POST", {});
    progress = await student.ok("/api/learning/progress");
    const score = progress.mastery.find((m) => m.trackId === "qudrat-quant");
    assert.equal(score.total, 5);
    assert.equal(score.correct, 0);
    assert.equal(score.accuracy, 0);
    const educationalContext = service.permittedContext(self);
    assert(
      educationalContext.recentMistakes.some(
        (m) =>
          m.questionId === "learning-q-0" &&
          m.selectedAnswer === "أ" &&
          m.correctAnswer === "ب",
      ),
    );
    assert(
      educationalContext.availableReviewLessons.some(
        (l) => l.courseId === selected[0],
      ),
    );
    assert(
      progress.plan.tasks.some(
        (t) =>
          t.kind === "test" &&
          t.source.testId === "learning-topic" &&
          t.status === "completed",
      ),
    );
    const weeklyAttempt = await student.ok("/api/tests/start", "POST", {
      id: "learning-weekly",
    });
    assert(weeklyAttempt.questions.some((q) => q.trackId === "qudrat-quant"));
    assert(weeklyAttempt.questions.some((q) => q.trackId === "qudrat-verbal"));
    for (const q of weeklyAttempt.questions)
      await student.ok(
        "/api/attempts/" + weeklyAttempt.id + "/answer",
        "POST",
        { id: q.id, choice: 1 },
      );
    const weeklyResult = await student.ok(
      "/api/attempts/" + weeklyAttempt.id + "/finish",
      "POST",
      {},
    );
    assert(
      weeklyResult.result.review.length === weeklyAttempt.questions.length,
    );
    await student.ok("/api/auth/logout", "POST", {});
    await student.ok("/api/auth/login", "POST", {
      email: "learning-student@example.test",
      password: "student-test-password-123",
    });
    const saved = await student.ok("/api/learning/me");
    assert.deepEqual(new Set(saved.selectedCourseIds), new Set(selected));
    assert.equal(saved.profile.targetScore, 95);
    assert.equal(saved.profile.dailyMinutes, 120);
    assert(
      (await student.ok("/api/learning/progress")).courses.some(
        (c) => c.watchedLessons > 0,
      ),
    );
    c = await owner.ok("/api/admin/content");
    c.tracks.find((t) => t.id === "qudrat-quant").visible = false;
    await owner.ok("/api/admin/content", "PUT", c);
    assert(
      !(await student.ok("/api/content")).courses.some(
        (x) => x.id === selected[0],
      ),
    );
    assert(
      !(await student.ok("/api/learning/catalog")).courses.some(
        (x) => x.id === selected[0],
      ),
    );
    assert.equal(
      (await student.req("/api/practice", "POST", { id: "q1", choice: 1 }))
        .status,
      404,
    );
    assert.equal(
      (
        await student.req(
          "/api/learning/lessons/" +
            selected[0] +
            "/learning-lesson-0-1/complete",
          "POST",
          {},
        )
      ).status,
      404,
    );
    assert.equal(
      (await student.req("/api/tests/start", "POST", { id: "learning-topic" }))
        .status,
      404,
    );
    assert(
      (await student.ok("/api/learning/me")).unavailableCourseChoices.some(
        (c) => c.id === selected[0],
      ),
    );
    await student.ok("/api/learning/selections", "PUT", {
      courseIds: selected,
    });
    c = await owner.ok("/api/admin/content");
    c.tracks.find((t) => t.id === "qudrat-quant").visible = true;
    await owner.ok("/api/admin/content", "PUT", c);
    const retained = await student.ok("/api/learning/progress");
    assert.equal(
      retained.courses.find((x) => x.id === selected[0]).watchedLessons > 0,
      true,
    );
    await owner.ok(
      "/api/admin/learning/instructors/" + teacherIds[0],
      "DELETE",
      {},
    );
    assert.equal(
      (await owner.ok("/api/admin/content")).courses.some(
        (c) => c.id === selected[0],
      ),
      true,
    );
    assert.equal(
      (await student.req("/api/instructors/" + teacherIds[0])).status,
      404,
    );
    await other.ok("/api/auth/register", "POST", {
      email: "other-student@example.test",
      name: "طالب آخر",
      password: "another-long-password-123",
    });
    assert.equal(
      (
        await other.req(
          "/api/learning/tasks/" + future.id + "/complete",
          "POST",
          {},
        )
      ).status,
      404,
    );
    assert.equal(
      (await other.req("/api/admin/learning/students/" + self.id)).status,
      403,
    );
  } finally {
    await f.close();
  }
});

test("additive migration backs up an existing database and preserves accounts, subscriptions, content and settings", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ruzmah-migrate-")),
    cfg = config({
      DATA_DIR: dir,
      APP_KEY: randomBytes(32).toString("base64"),
    });
  let store;
  try {
    store = openDatabase(cfg);
    const id = randomUUID();
    store.db
      .prepare(
        "INSERT INTO users(id,email,name,password_hash,role,created_at) VALUES(?,?,?,?, 'student',?)",
      )
      .run(
        id,
        "preserved@example.test",
        "سجل قائم",
        "unchanged-password-hash",
        new Date().toISOString(),
      );
    store.db
      .prepare("INSERT INTO subscriptions VALUES(?,?,?,?,?,?,NULL)")
      .run(randomUUID(), id, "year", "2026-01-01", "2027-01-01", "active");
    store.saveSetting(
      "ai",
      { ...store.setting("ai"), secrets: undefined, enabled: false },
      { apiKey: "synthetic-preserved-secret" },
    );
    const old = store.getContent();
    delete old.tracks;
    delete old.revision;
    for (const c of old.courses) {
      delete c.trackId;
      delete c.stage;
    }
    store.db
      .prepare("UPDATE content SET json=? WHERE id=1")
      .run(JSON.stringify(old));
    for (const name of [
      "learning_study_sessions",
      "learning_practice",
      "learning_lesson_progress",
      "learning_tasks",
      "learning_plans",
      "learning_selections",
      "learning_profiles",
      "instructors",
      "app_migrations",
    ])
      store.db.exec("DROP TABLE " + name);
    for (const col of ["duration_seconds", "video_width", "video_height"])
      store.db.exec("ALTER TABLE assets DROP COLUMN " + col);
    store.close();
    store = null;
    store = openDatabase(cfg);
    assert.equal(
      store.db.prepare("SELECT password_hash FROM users WHERE id=?").get(id)
        .password_hash,
      "unchanged-password-hash",
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) n FROM subscriptions WHERE user_id=?")
        .get(id).n,
      1,
    );
    assert.equal(
      store.setting("ai").secrets.apiKey,
      "synthetic-preserved-secret",
    );
    assert(store.getContent().tracks.some((t) => t.id === "qudrat-verbal"));
    assert.equal(store.getContent().courses.length, old.courses.length);
    const legacyImport = saveContent(
      store,
      structuredClone(old),
      store.getContent().revision,
      id,
    );
    assert(
      legacyImport.tracks.some((t) => t.id === "qudrat-quant"),
      "legacy content imports still acquire managed tracks",
    );
    const backups = (await readdir(join(dir, "backups"))).filter((n) =>
      n.startsWith("before-learning"),
    );
    assert.equal(backups.length, 1);
    const backup = new DatabaseSync(join(dir, "backups", backups[0]), {
      readOnly: true,
    });
    assert.equal(
      backup.prepare("SELECT password_hash FROM users WHERE id=?").get(id)
        .password_hash,
      "unchanged-password-hash",
    );
    assert.equal(
      backup
        .prepare(
          "SELECT name FROM sqlite_master WHERE name='learning_profiles'",
        )
        .get(),
      undefined,
    );
    backup.close();
    store.close();
    store = openDatabase(cfg);
    assert.equal(
      (await readdir(join(dir, "backups"))).filter((n) =>
        n.startsWith("before-learning"),
      ).length,
      1,
      "migration is idempotent",
    );
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

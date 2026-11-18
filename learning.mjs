import { canReadLesson, isPreview } from "../dist/course-policy.js";
import { randomUUID } from "node:crypto";
import { fail, jsonBody, cleanText } from "./security.mjs";
import {
  DEFAULT_RULES,
  todayKey,
  addDays,
  mergeRanges,
  coveredSeconds,
  lessonDuration,
  testVisible,
} from "./learning-model.mjs";
import { buildSchedule } from "./scheduler.mjs";
const now = () => new Date().toISOString();
const emptyProfile = {
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
  onboardingStep: 0,
};
export function learningService(store) {
  const { db } = store;
  const requireUser = (user) => {
    if (!user) fail(401, "سجل الدخول لتنظيم رحلتك");
    return user;
  };
  const profile = (user) => ({
    ...emptyProfile,
    ...JSON.parse(
      db
        .prepare("SELECT json FROM learning_profiles WHERE user_id=?")
        .get(user.id)?.json || "{}",
    ),
  });
  const rules = () => ({ ...DEFAULT_RULES, ...store.setting("scheduler") });
  const rawUser = (user) =>
    db.prepare("SELECT * FROM users WHERE id=?").get(user.id);
  const userState = (user) => JSON.parse(rawUser(user).state || "{}");
  const selected = (user) =>
    db
      .prepare(
        "SELECT course_id FROM learning_selections WHERE user_id=? AND active=1",
      )
      .all(user.id)
      .map((r) => r.course_id);
  const courseVisible = (c, content) =>
    c.visible &&
    content.sections.some((s) => s.id === c.sectionId && s.visible) &&
    (content.tracks || []).some(
      (t) => t.id === c.trackId && t.visible && !t.coming,
    );
  function access(user, course, lesson) {
    if (
      !course ||
      !lesson ||
      !courseVisible(course, store.getContent()) ||
      lesson.visible === false
    )
      fail(404, "الدرس غير متاح");
    if (!canReadLesson(course, lesson, user, store.entitled(user)))
      fail(403, "الدرس يتطلب اشتراكًا نشطًا");
  }
  function courseMeta(c) {
    const videos = c.lessons.filter(
        (l) => l.visible !== false && (l.videoAssetId || l.videoUrl),
      ),
      available = c.lessons.filter((l) => l.visible !== false),
      durations = available.map((l) => lessonDuration(l, rules()));
    return {
      lessonCount: available.length,
      videoCount: videos.length,
      videoSeconds: videos.reduce((n, l) => n + (l.durationSeconds || 0), 0),
      unknownVideoCount: videos.filter((l) => !l.durationSeconds).length,
      estimatedSeconds: durations
        .filter((d) => d.estimated)
        .reduce((n, d) => n + (d.seconds || 0), 0),
      knownSeconds: durations.reduce((n, d) => n + (d.seconds || 0), 0),
      attachments: available.reduce(
        (n, l) => n + (l.fileAssetIds || []).length,
        0,
      ),
    };
  }
  function instructorRow(r, content, admin = false) {
    const courses = content.courses.filter(
      (c) => c.instructorId === r.id && (admin || courseVisible(c, content)),
    );
    return {
      id: r.id,
      name: r.name,
      bio: r.bio,
      specialty: r.specialty,
      kind: r.kind,
      imageAssetId: r.image_asset_id || "",
      imageUrl: r.image_url || "",
      sectionIds: JSON.parse(r.section_ids),
      published: !!r.published,
      deleted: !!r.deleted,
      courseIds: courses.map((c) => c.id),
      videoCount: courses.reduce((n, c) => n + courseMeta(c).videoCount, 0),
      videoSeconds: courses.reduce((n, c) => n + courseMeta(c).videoSeconds, 0),
      unknownVideoCount: courses.reduce(
        (n, c) => n + courseMeta(c).unknownVideoCount,
        0,
      ),
    };
  }
  function catalog(user) {
    const content = store.getContent(),
      admin = user?.role === "admin";
    const instructors = db
      .prepare(
        "SELECT * FROM instructors WHERE deleted=0 " +
          (admin ? "" : "AND published=1") +
          " ORDER BY name",
      )
      .all()
      .map((r) => instructorRow(r, content, admin));
    const tracks = (content.tracks || [])
      .filter(
        (t) =>
          admin ||
          (t.visible &&
            content.sections.some((s) => s.id === t.sectionId && s.visible)),
      )
      .sort((a, b) => a.order - b.order);
    return {
      sections: content.sections.filter((s) => admin || s.visible),
      tracks,
      instructors,
      courses: content.courses
        .filter((c) => admin || courseVisible(c, content))
        .map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          sectionId: c.sectionId,
          subject: c.subject,
          trackId: c.trackId,
          stage: c.stage,
          instructorId: c.instructorId || "",
          visible: c.visible,
          order: c.order,
          thumbnail: c.thumbnail,
          thumbnailAssetId: c.thumbnailAssetId,
          art: c.art,
          status: c.status,
          access: c.access,
          metrics: courseMeta(c),
          lessons: c.lessons
            .filter((l) => admin || l.visible !== false)
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((l) => ({
              id: l.id,
              title: l.title,
              order: l.order,
              topicId: l.topicId,
              free: isPreview(c, l) || c.access === "free",
              preview: isPreview(c, l),
              video: !!(l.videoAssetId || l.videoUrl),
              durationSeconds: l.durationSeconds || null,
              durationSource: l.durationSource || null,
              estimatedMinutes: lessonDuration(l, rules()).estimated
                ? lessonDuration(l, rules()).seconds / 60
                : null,
              attachmentCount: (l.fileAssetIds || []).length,
              questionId: l.questionId,
              practiceQuestionIds: l.practiceQuestionIds || [],
            })),
        })),
      tests: (content.tests || [])
        .filter((t) => admin || testVisible(content, t))
        .map((t) => ({
          id: t.id,
          title: t.title,
          level: t.level,
          trackIds: t.trackIds || [],
          topicId: t.topicId || "",
          courseId: t.courseId || "",
          duration: t.duration,
          count: t.questionIds.length,
          visible: t.visible,
          access: t.access,
        })),
    };
  }
  function mastery(user) {
    const content = store.getContent(),
      latest = new Map();
    for (const a of db
      .prepare(
        "SELECT questions,result FROM attempts WHERE user_id=? AND result IS NOT NULL ORDER BY started",
      )
      .all(user.id)) {
      const qs = JSON.parse(a.questions),
        result = JSON.parse(a.result);
      for (const item of result.review) {
        const q = qs.find((q) => q.id === item.id);
        if (!q) continue;
        const trackId =
          q.trackId ||
          content.tracks?.find(
            (t) => t.sectionId === q.sectionId && t.subject === q.subject,
          )?.id ||
          "";
        if (trackId)
          latest.set(q.id, {
            trackId,
            correct: item.choice === item.correct,
            questionId: q.id,
          });
      }
    }
    const result = new Map();
    for (const r of latest.values()) {
      if (!result.has(r.trackId))
        result.set(r.trackId, { trackId: r.trackId, total: 0, correct: 0 });
      const m = result.get(r.trackId);
      m.total++;
      if (r.correct) m.correct++;
    }
    return [...result.values()].map((m) => ({
      ...m,
      accuracy: Math.round((m.correct / m.total) * 100),
      evidence: "test-answers",
      limited: m.total < 5,
    }));
  }
  function progressRows(user) {
    const rows = db
        .prepare("SELECT * FROM learning_lesson_progress WHERE user_id=?")
        .all(user.id),
      legacy = new Set(userState(user).completed || []),
      content = store.getContent(),
      counts = new Map(),
      present = new Set(rows.map((r) => r.course_id + "|" + r.lesson_id));
    for (const c of content.courses)
      for (const l of c.lessons) counts.set(l.id, (counts.get(l.id) || 0) + 1);
    for (const c of content.courses)
      for (const l of c.lessons)
        if (
          legacy.has(l.id) &&
          counts.get(l.id) === 1 &&
          !present.has(c.id + "|" + l.id)
        )
          rows.push({
            course_id: c.id,
            lesson_id: l.id,
            ranges: JSON.stringify(
              l.durationSeconds > 0 ? [[0, l.durationSeconds]] : [],
            ),
            read_completed: 1,
            legacy: true,
          });
    return rows;
  }
  function generate(user) {
    const content = store.getContent(),
      p = profile(user),
      selection = selected(user),
      old = db
        .prepare("SELECT version FROM learning_plans WHERE user_id=?")
        .get(user.id),
      version = (old?.version || 0) + 1;
    const schedule = buildSchedule({
      content,
      profile: p,
      selections: selection,
      progress: progressRows(user),
      completedTaskIds: db
        .prepare(
          "SELECT id FROM learning_tasks WHERE user_id=? AND status='completed'",
        )
        .all(user.id)
        .map((t) => t.id),
      mastery: mastery(user),
      mistakeIds: (userState(user).mistakes || []).filter((id) =>
        content.questions.some((q) => q.id === id),
      ),
      completedTodaySeconds: db
        .prepare(
          "SELECT seconds,completed_at FROM learning_tasks WHERE user_id=? AND status='completed'",
        )
        .all(user.id)
        .filter((t) => todayKey(t.completed_at) === todayKey())
        .reduce((n, t) => n + t.seconds, 0),
      rules: rules(),
    });
    const summary = {
      ...schedule.summary,
      contentRevision: content.revision,
      warnings: schedule.warnings,
      days: schedule.days,
    };
    store.transaction(() => {
      db.prepare(
        "UPDATE learning_tasks SET status='superseded' WHERE user_id=? AND status='pending'",
      ).run(user.id);
      for (const t of schedule.tasks) {
        db.prepare(
          `INSERT INTO learning_tasks(user_id,id,plan_version,course_id,lesson_id,track_id,stage,kind,title,seconds,source,scheduled_date,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET plan_version=excluded.plan_version,source=excluded.source,seconds=excluded.seconds,scheduled_date=excluded.scheduled_date,status='pending' WHERE learning_tasks.status<>'completed'`,
        ).run(
          user.id,
          t.id,
          version,
          t.courseId || null,
          t.lessonId || null,
          t.trackId || null,
          t.stage || null,
          t.kind,
          t.title,
          t.seconds,
          JSON.stringify({
            ...t.source,
            dependencies: t.dependencies || [],
            estimated: !!t.estimated,
            unknown: !!t.unknown,
          }),
          t.scheduledDate,
          "pending",
          now(),
        );
      }
      db.prepare(
        "INSERT INTO learning_plans VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET version=excluded.version,summary=excluded.summary,generated_at=excluded.generated_at",
      ).run(user.id, version, JSON.stringify(summary), now());
    });
    store.audit(user.id, "learning.replan", String(version), {
      courses: selection.length,
      remainingSeconds: summary.remainingSeconds,
    });
    return plan(user, false);
  }
  function taskRow(t) {
    return { ...t, source: JSON.parse(t.source), seconds: Number(t.seconds) };
  }
  function plan(user, refresh = true) {
    const row = db
      .prepare("SELECT * FROM learning_plans WHERE user_id=?")
      .get(user.id);
    if (!row)
      return { version: 0, summary: null, tasks: [], generatedAt: null };
    const summary = JSON.parse(row.summary);
    if (
      refresh &&
      (summary.generatedFor !== todayKey() ||
        summary.contentRevision !== store.getContent().revision)
    )
      return generate(user);
    return {
      version: row.version,
      summary,
      tasks: db
        .prepare(
          "SELECT * FROM learning_tasks WHERE user_id=? AND status IN ('pending','completed') ORDER BY scheduled_date IS NULL,scheduled_date,created_at,id",
        )
        .all(user.id)
        .map(taskRow),
      generatedAt: row.generated_at,
    };
  }
  function saveProfile(user, input) {
    const old = profile(user),
      p = { ...old };
    const content = store.getContent();
    if ("sectionId" in input) {
      if (
        input.sectionId !== null &&
        !content.sections.some((s) => s.id === input.sectionId && s.visible)
      )
        fail(400, "الاختبار غير متاح");
      p.sectionId = input.sectionId;
    }
    for (const key of ["foundationStarted", "foundationCompleted"])
      if (key in input) {
        if (input[key] !== null && typeof input[key] !== "boolean")
          fail(400, "إجابة التأسيس غير صالحة");
        p[key] = input[key];
      }
    if ("selfLevel" in input) {
      if (
        !["unknown", "beginner", "intermediate", "advanced"].includes(
          input.selfLevel,
        )
      )
        fail(400, "التقييم الذاتي غير صالح");
      p.selfLevel = input.selfLevel;
    }
    if ("targetScore" in input) {
      const n = input.targetScore;
      if (n !== null && (!Number.isFinite(n) || n < 0 || n > 100))
        fail(400, "الدرجة المستهدفة بين ٠ و١٠٠");
      p.targetScore = n;
    }
    if ("examDate" in input) {
      const date = input.examDate;
      if (
        date !== null &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
          Number.isNaN(Date.parse(date + "T12:00Z")) ||
          new Date(date + "T12:00Z").toISOString().slice(0, 10) !== date ||
          (date < todayKey() && date !== old.examDate))
      )
        fail(400, "اختر موعد اختبار صحيحًا");
      p.examDate = date;
    }
    if ("dailyMinutes" in input) {
      const m = input.dailyMinutes;
      if (m !== null && (!Number.isInteger(m) || m < 1 || m > 720))
        fail(400, "وقت الدراسة اليومي بين دقيقة و١٢ ساعة");
      p.dailyMinutes = m;
    }
    if ("studyDays" in input) {
      if (
        !Array.isArray(input.studyDays) ||
        input.studyDays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)
      )
        fail(400, "أيام الدراسة غير صالحة");
      p.studyDays = [...new Set(input.studyDays)].sort();
    }
    if ("onboardingStep" in input) {
      if (
        !Number.isInteger(input.onboardingStep) ||
        input.onboardingStep < 0 ||
        input.onboardingStep > 7
      )
        fail(400, "خطوة الترحيب غير صالحة");
      p.onboardingStep = input.onboardingStep;
    }
    if (p.foundationCompleted === true) p.foundationStarted = true;
    for (const key of ["aiContextConsent", "onboardingCompleted"])
      if (key in input) {
        if (typeof input[key] !== "boolean") fail(400, "إعداد الملف غير صالح");
        p[key] = input[key];
      }
    db.prepare(
      "INSERT INTO learning_profiles VALUES(?,?,1,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json,revision=revision+1,updated_at=excluded.updated_at",
    ).run(user.id, JSON.stringify(p), now());
    store.audit(user.id, "learning.profile", user.id);
    if (
      db
        .prepare("SELECT user_id FROM learning_plans WHERE user_id=?")
        .get(user.id)
    )
      generate(user);
    return p;
  }
  function saveSelections(user, ids) {
    if (
      !Array.isArray(ids) ||
      ids.length > 1500 ||
      ids.some((id) => typeof id !== "string")
    )
      fail(400, "اختيارات الدورات غير صالحة");
    const content = store.getContent(),
      previous = selected(user);
    for (const id of ids) {
      const c = content.courses.find((c) => c.id === id);
      if (!c || !courseVisible(c, content)) {
        if (previous.includes(id)) continue;
        fail(400, "إحدى الدورات لم تعد متاحة للاختيار");
      }
      if (
        c.instructorId &&
        !previous.includes(id) &&
        !db
          .prepare(
            "SELECT id FROM instructors WHERE id=? AND published=1 AND deleted=0",
          )
          .get(c.instructorId)
      )
        fail(400, "أحد المصادر غير متاح حاليًا");
    }
    store.transaction(() => {
      db.prepare("UPDATE learning_selections SET active=0 WHERE user_id=?").run(
        user.id,
      );
      for (const id of new Set(ids))
        db.prepare(
          "INSERT INTO learning_selections VALUES(?,?,1,?) ON CONFLICT(user_id,course_id) DO UPDATE SET active=1,updated_at=excluded.updated_at",
        ).run(user.id, id, now());
    });
    store.audit(user.id, "learning.select", user.id, { courseIds: ids });
    return generate(user);
  }
  function markLesson(user, courseId, lessonId, start = null, end = null) {
    const c = store.getContent().courses.find((c) => c.id === courseId),
      l = c?.lessons.find((l) => l.id === lessonId);
    access(user, c, l);
    const row = db
      .prepare(
        "SELECT * FROM learning_lesson_progress WHERE user_id=? AND course_id=? AND lesson_id=?",
      )
      .get(user.id, c.id, l.id);
    let ranges = JSON.parse(row?.ranges || "[]"),
      readCompleted = !!row?.read_completed;
    if (l.videoAssetId || l.videoUrl) {
      const duration = lessonDuration(l, rules()).seconds;
      if (!duration)
        fail(
          409,
          "لم تُستخرج مدة الفيديو بعد. حدّث المحتوى أو اطلب من الإدارة قياسه.",
        );
      const from = start ?? 0,
        to = end ?? duration;
      if (
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from < 0 ||
        to > duration + 1 ||
        to <= from
      )
        fail(400, "جزء المشاهدة غير صالح");
      ranges = mergeRanges([...ranges, [from, Math.min(to, duration)]]);
    } else readCompleted = true;
    db.prepare(
      "INSERT INTO learning_lesson_progress VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,course_id,lesson_id) DO UPDATE SET ranges=excluded.ranges,read_completed=excluded.read_completed,updated_at=excluded.updated_at",
    ).run(
      user.id,
      c.id,
      l.id,
      JSON.stringify(ranges),
      readCompleted ? 1 : 0,
      now(),
    );
    for (const task of db
      .prepare(
        "SELECT * FROM learning_tasks WHERE user_id=? AND course_id=? AND lesson_id=? AND status='pending' AND kind IN ('watch','read')",
      )
      .all(user.id, c.id, l.id)) {
      const source = JSON.parse(task.source);
      const covered =
        task.kind === "read"
          ? readCompleted
          : !source.unknown &&
            Number.isFinite(source.start) &&
            Number.isFinite(source.end) &&
            mergeRanges(ranges).some(
              ([from, to]) => from <= source.start && to >= source.end - 0.01,
            );
      if (covered)
        db.prepare(
          "UPDATE learning_tasks SET status='completed',completed_at=? WHERE user_id=? AND id=?",
        ).run(now(), user.id, task.id);
    }
    const done =
      readCompleted ||
      coveredSeconds(ranges) >=
        (lessonDuration(l, rules()).seconds || Infinity) - 1;
    if (done) {
      const state = userState(user);
      state.completed = [...new Set([...(state.completed || []), l.id])];
      db.prepare("UPDATE users SET state=? WHERE id=?").run(
        JSON.stringify(state),
        user.id,
      );
    }
    return { complete: done, watchedSeconds: coveredSeconds(ranges) };
  }
  function complete(user, id) {
    const t = db
      .prepare("SELECT * FROM learning_tasks WHERE user_id=? AND id=?")
      .get(user.id, id);
    if (!t || !["pending", "completed"].includes(t.status))
      fail(404, "المهمة غير متاحة؛ أعد تحميل الخطة");
    if (t.status === "completed") return { ok: true, duplicate: true };
    const source = JSON.parse(t.source);
    if (source.unknown) fail(409, "مدة هذه المهمة غير معروفة");
    if (t.kind === "watch" || t.kind === "read")
      markLesson(
        user,
        t.course_id,
        t.lesson_id,
        source.start ?? null,
        source.end ?? null,
      );
    if (t.kind === "practice" && (source.questionIds || []).length) {
      const dependencies = (source.dependencies || [])
        .map((id) =>
          db
            .prepare(
              "SELECT status,completed_at FROM learning_tasks WHERE user_id=? AND id=?",
            )
            .get(user.id, id),
        )
        .filter(Boolean);
      if (dependencies.some((d) => d.status !== "completed"))
        fail(409, "أكمل المحتوى المرتبط ثم حل أسئلة المهمة.");
      const since = new Date(
        Math.max(
          Date.parse(t.created_at),
          ...dependencies.map((d) => Date.parse(d.completed_at) || 0),
        ),
      ).toISOString();
      const used = [];
      for (const id of source.questionIds) {
        const event = db
          .prepare(
            `SELECT p.id FROM learning_practice p WHERE p.user_id=? AND p.question_id=? AND p.created_at>=? AND NOT EXISTS (SELECT 1 FROM learning_tasks t,json_each(t.source,'$.practiceEvents') j WHERE t.user_id=p.user_id AND t.status='completed' AND j.value=p.id) ORDER BY p.id DESC LIMIT 1`,
          )
          .get(user.id, id, since);
        if (!event)
          fail(
            409,
            "حل الأسئلة المرتبطة بعد مشاهدة المحتوى. المحاولة الواحدة لا تُحتسب لعدة مهام.",
          );
        used.push(event.id);
      }
      db.prepare(
        "UPDATE learning_tasks SET source=? WHERE user_id=? AND id=?",
      ).run(JSON.stringify({ ...source, practiceEvents: used }), user.id, id);
    }
    if (t.kind === "test") {
      const since =
        source.level === "weekly"
          ? Date.parse(addDays(t.scheduled_date || todayKey(), -6) + "T00:00Z")
          : 0;
      if (
        !db
          .prepare(
            "SELECT id FROM attempts WHERE user_id=? AND test_id=? AND result IS NOT NULL AND started>=? LIMIT 1",
          )
          .get(user.id, source.testId, since)
      )
        fail(409, "أكمل الاختبار المرتبط لتُحتسب المهمة");
    }
    db.prepare(
      "UPDATE learning_tasks SET status='completed',completed_at=? WHERE user_id=? AND id=? AND status='pending'",
    ).run(now(), user.id, id);
    store.audit(user.id, "learning.task.complete", id, { kind: t.kind });
    return { ok: true };
  }
  function recordPractice(user, q, choice) {
    db.prepare(
      "INSERT INTO learning_practice(user_id,question_id,choice,correct,created_at) VALUES(?,?,?,?,?)",
    ).run(user.id, q.id, choice, choice === q.correct ? 1 : 0, now());
    for (const t of db
      .prepare(
        "SELECT * FROM learning_tasks WHERE user_id=? AND status='pending' AND kind='practice'",
      )
      .all(user.id)) {
      const s = JSON.parse(t.source);
      if (s.questionIds?.includes(q.id)) {
        try {
          complete(user, t.id);
        } catch (err) {
          if (err.status !== 409) throw err;
        }
      }
    }
  }
  function afterAssessment(user, testId) {
    if (
      db
        .prepare("SELECT user_id FROM learning_plans WHERE user_id=?")
        .get(user.id)
    )
      plan(user);
    for (const t of db
      .prepare(
        "SELECT * FROM learning_tasks WHERE user_id=? AND kind='test' AND status='pending'",
      )
      .all(user.id)) {
      if (JSON.parse(t.source).testId === testId) {
        try {
          complete(user, t.id);
        } catch (err) {
          if (err.status !== 409) throw err;
        }
      }
    }
    if (
      db
        .prepare("SELECT user_id FROM learning_plans WHERE user_id=?")
        .get(user.id)
    )
      generate(user);
  }
  function progress(user) {
    for (const s of db
      .prepare(
        "SELECT id FROM learning_study_sessions WHERE user_id=? AND ended IS NULL AND last_seen<?",
      )
      .all(user.id, Date.now() - 90000))
      stopStudy(user, s.id);
    const p = profile(user),
      selection = selected(user),
      content = store.getContent(),
      rows = progressRows(user),
      current = plan(user),
      day = todayKey(),
      weekStart = addDays(
        day,
        -((new Date(day + "T12:00Z").getUTCDay() + 1) % 7),
      ),
      weekEnd = addDays(weekStart, 6);
    const activeTasks = current.tasks.filter(
      (t) =>
        (t.kind !== "break" &&
          !t.source.unknown &&
          selection.includes(t.course_id)) ||
        (t.kind !== "break" && !t.source.unknown && !t.course_id),
    );
    const percent = (list) => {
      const all = list.reduce((n, t) => n + t.seconds, 0),
        done = list
          .filter((t) => t.status === "completed")
          .reduce((n, t) => n + t.seconds, 0);
      return {
        totalSeconds: all,
        completedSeconds: done,
        percent: all ? Math.min(100, Math.round((done / all) * 100)) : null,
      };
    };
    const todayTasks = activeTasks.filter((t) => t.scheduled_date === day),
      weekTasks = activeTasks.filter(
        (t) => t.scheduled_date >= weekStart && t.scheduled_date <= weekEnd,
      );
    const completedToday = activeTasks.filter(
      (t) => t.completed_at && todayKey(t.completed_at) === day,
    );
    const sessions = db
      .prepare(
        "SELECT * FROM learning_study_sessions WHERE user_id=? ORDER BY started DESC LIMIT 5000",
      )
      .all(user.id);
    return {
      profile: p,
      selection,
      plan: current,
      today: {
        date: day,
        ...percent(todayTasks),
        completedTasks: completedToday.length,
        extraTasks: completedToday.filter((t) => t.scheduled_date !== day)
          .length,
        sessionSeconds: sessions
          .filter((s) => todayKey(s.started) === day)
          .reduce((n, s) => n + s.seconds, 0),
      },
      week: { start: weekStart, end: weekEnd, ...percent(weekTasks) },
      daysToExam: p.examDate
        ? Math.max(
            0,
            Math.ceil(
              (Date.parse(p.examDate + "T12:00Z") -
                Date.parse(day + "T12:00Z")) /
                86400000,
            ),
          )
        : null,
      courses: content.courses
        .filter((c) => selection.includes(c.id))
        .map((c) => {
          const lessons = c.lessons.filter((l) => l.visible !== false),
            done = lessons.filter((l) => {
              const r = rows.find(
                (r) => r.course_id === c.id && r.lesson_id === l.id,
              );
              return (
                !!r &&
                (r.read_completed ||
                  (lessonDuration(l, rules()).seconds &&
                    coveredSeconds(JSON.parse(r.ranges)) >=
                      lessonDuration(l, rules()).seconds - 1))
              );
            }).length;
          return {
            id: c.id,
            title: c.title,
            trackId: c.trackId,
            stage: c.stage,
            instructorId: c.instructorId,
            lessons: lessons.length,
            watchedLessons: done,
            percent: lessons.length
              ? Math.round((done / lessons.length) * 100)
              : null,
            ...courseMeta(c),
          };
        }),
      mastery: mastery(user),
    };
  }
  function me(user) {
    const content = store.getContent(),
      ids = selected(user);
    return {
      profile: profile(user),
      selectedCourseIds: ids,
      unavailableCourseChoices: ids
        .filter(
          (id) =>
            !content.courses.some(
              (c) => c.id === id && courseVisible(c, content),
            ),
        )
        .map((id) => ({
          id,
          title:
            content.courses.find((c) => c.id === id)?.title ||
            "دورة لم تعد منشورة",
        })),
      hasPlan: !!db
        .prepare("SELECT user_id FROM learning_plans WHERE user_id=?")
        .get(user.id),
    };
  }
  function stopStudy(user, id) {
    const s = db
      .prepare("SELECT * FROM learning_study_sessions WHERE id=? AND user_id=?")
      .get(id, user.id);
    if (!s) fail(404, "جلسة المذاكرة غير موجودة");
    if (s.ended) return { seconds: s.seconds };
    const end = Math.min(Date.now(), s.last_seen + 30000),
      seconds = Math.max(0, Math.floor((end - s.started) / 1000));
    db.prepare(
      "UPDATE learning_study_sessions SET ended=?,seconds=? WHERE id=? AND ended IS NULL",
    ).run(Date.now(), seconds, s.id);
    return { seconds };
  }
  function permittedContext(user) {
    const p = profile(user);
    if (!p.aiContextConsent) return null;
    const value = progress(user);
    const content = store.getContent(),
      seen = new Set(),
      recentMistakes = [];
    for (const attempt of db
      .prepare(
        "SELECT questions,result FROM attempts WHERE user_id=? AND result IS NOT NULL ORDER BY started DESC LIMIT 20",
      )
      .all(user.id)) {
      const questions = JSON.parse(attempt.questions);
      for (const answer of JSON.parse(attempt.result).review) {
        if (seen.has(answer.id)) continue;
        seen.add(answer.id);
        if (answer.choice === answer.correct) continue;
        const q = questions.find((q) => q.id === answer.id);
        if (q && content.questions.some((x) => x.id === q.id))
          recentMistakes.push({
            questionId: q.id,
            question: q.text,
            selectedAnswer: q.options[answer.choice] ?? null,
            correctAnswer: q.options[answer.correct],
            explanation: q.explanation,
            source: "graded-assessment",
          });
      }
      if (recentMistakes.length >= 6) break;
    }
    for (const attempt of db
      .prepare(
        "SELECT * FROM learning_practice WHERE user_id=? ORDER BY id DESC LIMIT 50",
      )
      .all(user.id)) {
      if (recentMistakes.length >= 6) break;
      if (seen.has(attempt.question_id)) continue;
      seen.add(attempt.question_id);
      if (attempt.correct) continue;
      const q = content.questions.find((q) => q.id === attempt.question_id);
      if (q)
        recentMistakes.push({
          questionId: q.id,
          question: q.text,
          selectedAnswer: q.options[attempt.choice] ?? null,
          correctAnswer: q.options[q.correct],
          explanation: q.explanation,
          source: "graded-practice",
        });
    }
    return {
      exam: p.sectionId,
      selfReportedLevel: p.selfLevel,
      targetScore: p.targetScore,
      examDate: p.examDate,
      dailyMinutes: p.dailyMinutes,
      studyDays: p.studyDays,
      selectedCourses: value.courses.map((c) => ({
        title: c.title,
        trackId: c.trackId,
        stage: c.stage,
        watchedLessons: c.watchedLessons,
        lessons: c.lessons,
      })),
      assessmentEvidence: value.mastery,
      recentMistakes: recentMistakes.slice(0, 6),
      availableReviewLessons: content.courses
        .filter(
          (c) => value.selection.includes(c.id) && courseVisible(c, content),
        )
        .flatMap((c) =>
          c.lessons
            .filter((l) => l.visible !== false)
            .slice(0, 2)
            .map((l) => ({
              courseId: c.id,
              lessonId: l.id,
              title: l.title,
              trackId: c.trackId,
              topicId: l.topicId || null,
            })),
        )
        .slice(0, 12),
      remainingToday: value.plan.tasks
        .filter(
          (t) => t.status === "pending" && t.scheduled_date === todayKey(),
        )
        .map((t) => ({
          title: t.title,
          kind: t.kind,
          estimatedMinutes: Math.ceil(t.seconds / 60),
        }))
        .slice(0, 12),
      note: "المشاهدة ليست إتقانًا. التقييم الذاتي ليس نتيجة اختبار.",
    };
  }
  async function handle({ path, method, url, req, user, send }) {
    const admin = user?.role === "admin";
    if (path === "/api/learning/catalog" && method === "GET") {
      send(catalog(user));
      return true;
    }
    const publicTeacher = /^\/api\/instructors(?:\/([\w-]+))?$/.exec(path);
    if (publicTeacher && method === "GET") {
      const content = store.getContent();
      if (publicTeacher[1]) {
        const r = db
          .prepare(
            "SELECT * FROM instructors WHERE id=? AND published=1 AND deleted=0",
          )
          .get(publicTeacher[1]);
        if (!r) fail(404, "المدرس أو المصدر غير منشور");
        send({
          ...instructorRow(r, content),
          courses: catalog(user).courses.filter((c) => c.instructorId === r.id),
        });
        return true;
      }
      const limit = Math.min(
          50,
          Math.max(1, Number(url.searchParams.get("limit")) || 24),
        ),
        offset = Math.max(0, Number(url.searchParams.get("offset")) || 0),
        q = "%" + String(url.searchParams.get("q") || "").slice(0, 100) + "%";
      const list = db
        .prepare(
          "SELECT * FROM instructors WHERE published=1 AND deleted=0 AND (name LIKE ? OR specialty LIKE ?) ORDER BY name LIMIT ? OFFSET ?",
        )
        .all(q, q, limit, offset);
      send({
        items: list.map((r) => instructorRow(r, content)),
        total: db
          .prepare(
            "SELECT count(*) n FROM instructors WHERE published=1 AND deleted=0 AND (name LIKE ? OR specialty LIKE ?)",
          )
          .get(q, q).n,
      });
      return true;
    }
    if (
      !path.startsWith("/api/learning/") &&
      !path.startsWith("/api/admin/learning/")
    )
      return false;
    requireUser(user);
    if (path.startsWith("/api/admin/") && !admin)
      fail(403, "الإدارة خاصة بالمالك");
    if (path === "/api/learning/me" && method === "GET") {
      send(me(user));
      return true;
    }
    if (path === "/api/learning/profile" && method === "PUT") {
      send({ profile: saveProfile(user, await jsonBody(req, 20000)) });
      return true;
    }
    if (path === "/api/learning/selections" && method === "PUT") {
      send(saveSelections(user, (await jsonBody(req, 100000)).courseIds));
      return true;
    }
    if (path === "/api/learning/plan" && method === "GET") {
      send(plan(user));
      return true;
    }
    if (path === "/api/learning/plan" && method === "POST") {
      send(generate(user));
      return true;
    }
    if (path === "/api/learning/progress" && method === "GET") {
      send(progress(user));
      return true;
    }
    const completeMatch = /^\/api\/learning\/tasks\/([\w-]+)\/complete$/.exec(
      path,
    );
    if (completeMatch && method === "POST") {
      send(complete(user, completeMatch[1]));
      return true;
    }
    const lessonMatch =
      /^\/api\/learning\/lessons\/([\w-]+)\/([\w-]+)\/complete$/.exec(path);
    if (lessonMatch && method === "POST") {
      send(markLesson(user, lessonMatch[1], lessonMatch[2]));
      return true;
    }
    if (path === "/api/learning/study/start" && method === "POST") {
      const b = await jsonBody(req, 2000);
      if (
        b.taskId &&
        !db
          .prepare(
            "SELECT id FROM learning_tasks WHERE user_id=? AND id=? AND status='pending'",
          )
          .get(user.id, b.taskId)
      )
        fail(400, "المهمة غير متاحة");
      const existing = db
        .prepare(
          "SELECT id FROM learning_study_sessions WHERE user_id=? AND ended IS NULL",
        )
        .all(user.id);
      for (const s of existing) stopStudy(user, s.id);
      const id = randomUUID();
      db.prepare(
        "INSERT INTO learning_study_sessions(id,user_id,task_id,started,last_seen) VALUES(?,?,?,?,?)",
      ).run(id, user.id, b.taskId || null, Date.now(), Date.now());
      send({ id, started: Date.now() });
      return true;
    }
    const studyMatch = /^\/api\/learning\/study\/([\w-]+)\/(ping|stop)$/.exec(
      path,
    );
    if (studyMatch && method === "POST") {
      if (studyMatch[2] === "stop") send(stopStudy(user, studyMatch[1]));
      else {
        const s = db
          .prepare(
            "SELECT * FROM learning_study_sessions WHERE id=? AND user_id=? AND ended IS NULL",
          )
          .get(studyMatch[1], user.id);
        if (!s) fail(404, "الجلسة غير نشطة");
        if (Date.now() - s.last_seen > 90000) {
          send({ ...stopStudy(user, s.id), expired: true });
          return true;
        }
        db.prepare(
          "UPDATE learning_study_sessions SET last_seen=? WHERE id=?",
        ).run(Date.now(), s.id);
        send({ ok: true });
      }
      return true;
    }
    if (path === "/api/admin/learning/instructors" && method === "GET") {
      send(
        db
          .prepare("SELECT * FROM instructors ORDER BY updated_at DESC")
          .all()
          .map((r) => instructorRow(r, store.getContent(), true)),
      );
      return true;
    }
    if (path === "/api/admin/learning/instructors" && method === "POST") {
      const b = await jsonBody(req, 16000),
        id = b.id || randomUUID(),
        content = store.getContent();
      if (!/^[\w-]{1,100}$/.test(id)) fail(400, "معرف غير صالح");
      const value = {
        name: cleanText(b.name, 120),
        bio: cleanText(b.bio || "", 4000),
        specialty: cleanText(b.specialty || "", 200),
        kind: b.kind || "teacher",
        imageAssetId: b.imageAssetId || "",
        imageUrl: cleanText(b.imageUrl || "", 2000),
        sectionIds: b.sectionIds || [],
        published: !!b.published,
      };
      if (
        !value.name ||
        !["teacher", "source"].includes(value.kind) ||
        !Array.isArray(value.sectionIds) ||
        !value.sectionIds.every((id) =>
          content.sections.some((s) => s.id === id),
        )
      )
        fail(400, "بيانات المدرس أو المصدر غير صالحة");
      if (
        value.imageAssetId &&
        !db
          .prepare(
            "SELECT id FROM assets WHERE id=? AND public=1 AND mime LIKE 'image/%' AND status='ready'",
          )
          .get(value.imageAssetId)
      )
        fail(400, "اختر صورة عامة من المكتبة");
      if (value.imageUrl && !/^https:\/\//.test(value.imageUrl))
        fail(400, "رابط الصورة يجب أن يكون HTTPS");
      db.prepare(
        "INSERT INTO instructors VALUES(?,?,?,?,?,?,?,?,?,0,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,bio=excluded.bio,specialty=excluded.specialty,kind=excluded.kind,image_asset_id=excluded.image_asset_id,image_url=excluded.image_url,section_ids=excluded.section_ids,published=excluded.published,deleted=0,updated_at=excluded.updated_at",
      ).run(
        id,
        value.name,
        value.bio,
        value.specialty,
        value.kind,
        value.imageAssetId || null,
        value.imageUrl || null,
        JSON.stringify(value.sectionIds),
        value.published ? 1 : 0,
        now(),
        now(),
      );
      store.audit(user.id, "instructor.save", id);
      send({ id });
      return true;
    }
    const instructorMatch =
      /^\/api\/admin\/learning\/instructors\/([\w-]+)$/.exec(path);
    if (instructorMatch && method === "DELETE") {
      db.prepare(
        "UPDATE instructors SET published=0,deleted=1,updated_at=? WHERE id=?",
      ).run(now(), instructorMatch[1]);
      store.audit(user.id, "instructor.archive", instructorMatch[1]);
      send({ ok: true, preservedCourses: true });
      return true;
    }
    if (path === "/api/admin/learning/rules" && method === "GET") {
      send(rules());
      return true;
    }
    if (path === "/api/admin/learning/rules" && method === "PUT") {
      const b = await jsonBody(req, 5000),
        limits = {
          questionSeconds: [15, 900],
          offlinePracticeMinutes: [1, 60],
          reviewMinutes: [1, 60],
          breakEveryMinutes: [15, 120],
          breakMinutes: [1, 30],
          maxWatchBlockMinutes: [5, 120],
          finalReviewMinutes: [1, 120],
          planningDays: [7, 730],
        },
        out = {};
      for (const [key, [min, max]] of Object.entries(limits)) {
        if (!Number.isInteger(b[key]) || b[key] < min || b[key] > max)
          fail(400, "قيمة قاعدة " + key + " غير صالحة");
        out[key] = b[key];
      }
      store.saveSetting("scheduler", out, {});
      store.audit(user.id, "scheduler.rules", "scheduler");
      send(out);
      return true;
    }
    const studentMatch = /^\/api\/admin\/learning\/students\/([\w-]+)$/.exec(
      path,
    );
    if (studentMatch && method === "GET") {
      const u = db
        .prepare("SELECT * FROM users WHERE id=? AND role='student'")
        .get(studentMatch[1]);
      if (!u) fail(404, "الطالب غير موجود");
      send({ name: u.name, ...progress(u) });
      return true;
    }
    return false;
  }
  return {
    handle,
    profile,
    me,
    catalog,
    generate,
    plan,
    progress,
    markLesson,
    recordPractice,
    afterAssessment,
    permittedContext,
  };
}

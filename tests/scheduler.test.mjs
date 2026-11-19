import test from "node:test";
import assert from "node:assert/strict";
import { buildSchedule } from "../server/scheduler.mjs";
import {
  normalizeContent,
  DEFAULT_RULES,
  mergeRanges,
  coveredSeconds,
  missingRanges,
  dayNumber,
} from "../server/learning-model.mjs";
const today = "2026-11-17";
function fixture({ clips = 8, seconds = 300 } = {}) {
  const courses = [];
  for (const [track, subject] of [
    ["quant", "كمي"],
    ["verbal", "لفظي"],
  ])
    for (const stage of ["foundation", "training"])
      courses.push({
        id: track + "-" + stage,
        sectionId: "qudrat",
        subject,
        stage,
        instructorId: track + "-" + stage,
        visible: true,
        title: track + " " + stage,
        order: courses.length + 1,
        lessons: Array.from({ length: clips }, (_, i) => ({
          id: track + "-" + stage + "-" + i,
          title: "مقطع " + i,
          body: "",
          videoAssetId: "asset-" + track + "-" + stage + "-" + i,
          durationSeconds: seconds,
          free: true,
          order: i + 1,
          questionId: "q-" + track,
        })),
      });
  return normalizeContent({
    sections: [{ id: "qudrat", title: "القدرات", visible: true }],
    courses,
    questions: [
      { id: "q-quant", sectionId: "qudrat", subject: "كمي" },
      { id: "q-verbal", sectionId: "qudrat", subject: "لفظي" },
    ],
    tests: [],
    updates: [],
  });
}
const profile = {
  sectionId: "qudrat",
  foundationCompleted: false,
  selfLevel: "intermediate",
  dailyMinutes: 120,
  studyDays: [0, 1, 2, 3, 4, 5, 6],
  examDate: "2026-12-15",
};
function build(content, p = profile, extra = {}) {
  return buildSchedule({
    content,
    profile: p,
    selections: content.courses.map((c) => c.id),
    today,
    ...extra,
  });
}
test("real durations control clip counts; 2/4 hour days balance quantitative and verbal without overload", () => {
  const content = fixture({ clips: 12, seconds: 600 });
  const two = build(content),
    four = build(content, { ...profile, dailyMinutes: 240 });
  for (const p of [two, four])
    for (const day of p.days) {
      assert(day.scheduledSeconds <= p.summary.dailySeconds);
      assert.equal(
        p.tasks
          .filter((t) => t.scheduledDate === day.date)
          .reduce((n, t) => n + t.seconds, 0),
        day.scheduledSeconds,
      );
    }
  const dayTasks = (p) =>
    p.tasks.filter((t) => t.scheduledDate === today && t.kind === "watch");
  assert(new Set(dayTasks(two).map((t) => t.trackId)).size === 2);
  assert(
    dayTasks(four).reduce((n, t) => n + t.seconds, 0) >
      dayTasks(two).reduce((n, t) => n + t.seconds, 0),
  );
  const short = build(fixture({ clips: 8, seconds: 300 })),
    long = build(fixture({ clips: 8, seconds: 3000 }));
  assert(
    new Set(dayTasks(short).map((t) => t.lessonId)).size >
      new Set(dayTasks(long).map((t) => t.lessonId)).size,
  );
  assert(content.courses.every((c) => c.instructorId !== undefined));
});
test("infeasible deadlines and unknown durations are explicit; late work is replanned into future study days", () => {
  const c = fixture({ clips: 12, seconds: 2700 }),
    one = build(c, { ...profile, examDate: "2026-11-18" });
  assert.equal(one.summary.feasible, false);
  assert(one.summary.remainingSeconds > 0);
  assert(one.tasks.some((t) => t.scheduledDate === null));
  assert(one.days.every((d) => d.scheduledSeconds <= 7200));
  c.courses[0].lessons[0].durationSeconds = null;
  const missing = build(c);
  assert.equal(missing.summary.unknownDurationCount, 1);
  assert(missing.warnings.some((w) => w.code === "duration"));
  const late = build(
    c,
    { ...profile, studyDays: [0, 2, 4] },
    { today: "2026-11-24" },
  );
  assert(
    late.tasks
      .filter((t) => t.scheduledDate)
      .every(
        (t) =>
          t.scheduledDate >= "2026-11-24" &&
          [0, 2, 4].includes(dayNumber(t.scheduledDate)),
      ),
  );
  assert(late.days.every((d) => d.scheduledSeconds <= 7200));
});
test("partial video intervals are deduplicated and content completion is independent from mastery", () => {
  assert.deepEqual(
    mergeRanges([
      [0, 100],
      [50, 150],
      [200, 250],
    ]),
    [
      [0, 150],
      [200, 250],
    ],
  );
  assert.equal(
    coveredSeconds([
      [0, 100],
      [50, 150],
    ]),
    150,
  );
  assert.deepEqual(
    missingRanges(300, [
      [0, 150],
      [200, 250],
    ]),
    [
      [150, 200],
      [250, 300],
    ],
  );
  const c = fixture({ clips: 1, seconds: 1800 }),
    row = {
      course_id: c.courses[0].id,
      lesson_id: c.courses[0].lessons[0].id,
      ranges: "[[0,900]]",
      read_completed: 0,
    };
  const plan = build(c, profile, { progress: [row] });
  assert.equal(
    plan.tasks
      .filter((t) => t.courseId === row.course_id && t.kind === "watch")
      .reduce((n, t) => n + t.seconds, 0),
    900,
  );
  assert(
    plan.tasks
      .filter((t) => t.courseId === row.course_id && t.kind === "watch")
      .every((t) => t.source.start >= 900),
  );
  assert(!("mastery" in plan.summary));
});
test("weekly and topic assessments use published configured questions; missing exams are not invented", () => {
  const c = fixture({ clips: 1, seconds: 300 });
  c.tests = [
    {
      id: "topic-real",
      title: "اختبار موضوع",
      level: "topic",
      visible: true,
      trackIds: ["qudrat-quant"],
      duration: 600,
      questionIds: ["q-quant"],
    },
    {
      id: "weekly-real",
      title: "اختبار أسبوعي",
      level: "weekly",
      visible: true,
      trackIds: ["qudrat-quant", "qudrat-verbal"],
      duration: 900,
      questionIds: ["q-quant", "q-verbal"],
    },
  ];
  const p = build(c, { ...profile, examDate: "2026-11-25" });
  assert(p.tasks.some((t) => t.source.testId === "topic-real"));
  assert(p.tasks.some((t) => t.source.testId === "weekly-real"));
  assert(
    p.tasks
      .filter((t) => t.kind === "test")
      .every((t) => t.source.questionCount > 0),
  );
  c.tests = [];
  const empty = build(c);
  assert(!empty.tasks.some((t) => t.kind === "test"));
  assert(empty.warnings.some((w) => w.code === "weekly-test"));
});

test("measured weakness receives more study time without inferring mastery from views", () => {
  const content = fixture({ clips: 30, seconds: 600 });
  const p = build(
    content,
    { ...profile, foundationCompleted: true, dailyMinutes: 240 },
    {
      mastery: [
        { trackId: "qudrat-quant", total: 10, correct: 2 },
        { trackId: "qudrat-verbal", total: 10, correct: 9 },
      ],
    },
  );
  const work = (track) =>
    p.tasks
      .filter(
        (t) =>
          t.kind === "watch" &&
          t.trackId === track &&
          t.scheduledDate === today,
      )
      .reduce((n, t) => n + t.seconds, 0);
  assert(work("qudrat-quant") > work("qudrat-verbal"));
  assert(p.days.every((d) => d.scheduledSeconds <= 14400));
});

test("replanning respects work already completed today and keeps calendar weekly assessments stable", () => {
  const c = fixture({ clips: 8, seconds: 600 });
  c.tests = [
    {
      id: "weekly",
      title: "اختبار الأسبوع",
      level: "weekly",
      visible: true,
      trackIds: ["qudrat-quant", "qudrat-verbal"],
      duration: 900,
      questionIds: ["q-quant", "q-verbal"],
    },
  ];
  const first = build(c),
    tomorrow = build(c, profile, { today: "2026-11-18" }),
    weekly = (p) =>
      p.tasks.find(
        (t) => t.source.testId === "weekly" && t.scheduledDate >= "2026-11-17",
      );
  assert.equal(weekly(first).scheduledDate, "2026-11-20");
  assert.equal(weekly(tomorrow).scheduledDate, weekly(first).scheduledDate);
  const full = build(c, profile, { completedTodaySeconds: 7200 });
  assert.equal(full.summary.remainingTodaySeconds, 0);
  assert.equal(full.days[0].scheduledSeconds, 0);
  assert.equal(full.days[0].capacitySeconds, 0);
  assert(full.tasks.some((t) => t.scheduledDate > "2026-11-17"));
  c.tests[0].duration = 14400;
  const tooLong = build(c);
  assert.equal(tooLong.summary.feasible, false);
  assert(
    tooLong.tasks.some(
      (t) => t.source.testId === "weekly" && t.scheduledDate === null,
    ),
  );
  assert(tooLong.summary.remainingSeconds >= 14400);
});

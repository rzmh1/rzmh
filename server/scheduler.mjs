import {
  DEFAULT_RULES,
  todayKey,
  addDays,
  dayNumber,
  taskId,
  lessonDuration,
  missingRanges,
  testVisible,
} from "./learning-model.mjs";
export function buildSchedule({
  content,
  profile,
  selections,
  progress = [],
  completedTaskIds = [],
  mastery = [],
  mistakeIds = [],
  completedTodaySeconds = 0,
  rules = DEFAULT_RULES,
  today = todayKey(),
}) {
  rules = { ...DEFAULT_RULES, ...rules };
  const budget = Math.round((profile.dailyMinutes || 0) * 60),
    weekdays = profile.studyDays || [],
    completed = new Set(completedTaskIds),
    byLesson = new Map(
      progress.map((p) => [p.course_id + "|" + p.lesson_id, p]),
    );
  const courses = content.courses.filter(
    (c) =>
      selections.includes(c.id) &&
      c.visible &&
      content.sections.some((s) => s.id === c.sectionId && s.visible) &&
      (content.tracks || []).some(
        (t) => t.id === c.trackId && t.visible && !t.coming,
      ),
  );
  const warnings = [],
    tasks = [],
    watchByTrack = new Map(),
    topicCandidates = [],
    lanes = new Map(),
    allIds = new Set();
  if (!profile.sectionId)
    warnings.push({ code: "profile", message: "حدد الاختبار الذي تستعد له." });
  if (!budget || !weekdays.length)
    warnings.push({
      code: "availability",
      message: "حدد وقت المذاكرة وأيامها لإنشاء جدول قابل للتنفيذ.",
    });
  if (!courses.length)
    warnings.push({
      code: "courses",
      message: "اختر دورة واحدة على الأقل. يمكنك تأجيل بقية المسارات.",
    });
  const maxWatch =
    budget > 0
      ? Math.max(
          30,
          Math.min(
            rules.maxWatchBlockMinutes * 60,
            budget - rules.breakMinutes * 60,
          ),
        )
      : rules.maxWatchBlockMinutes * 60;
  function add(task) {
    if (allIds.has(task.id) || completed.has(task.id)) return;
    allIds.add(task.id);
    task.dependencies ||= [];
    task.estimated ??= false;
    task.status = "pending";
    tasks.push(task);
    if (!task.unknown) {
      const key = task.trackId + "|" + task.stage;
      if (!lanes.has(key)) lanes.set(key, []);
      lanes.get(key).push(task);
    }
  }
  for (const c of courses) {
    let previousWatch = null;
    const topicWatches = new Map();
    for (const l of [...c.lessons]
      .filter((l) => l.visible !== false)
      .sort((a, b) => (a.order || 0) - (b.order || 0))) {
      const duration = lessonDuration(l, rules),
        p = byLesson.get(c.id + "|" + l.id),
        ranges = p ? JSON.parse(p.ranges || "[]") : [],
        readDone = !!p?.read_completed;
      const video = !!(l.videoAssetId || l.videoUrl),
        base = {
          courseId: c.id,
          lessonId: l.id,
          trackId: c.trackId,
          stage: c.stage || "foundation",
        };
      let watchIds = [];
      if (duration.seconds === null) {
        add({
          ...base,
          id: taskId("unknown", c.id, l.id),
          kind: "watch",
          title: l.title,
          seconds: 0,
          unknown: true,
          source: { durationSource: duration.source },
          dependencies: [],
        });
        warnings.push({
          code: "duration",
          courseId: c.id,
          lessonId: l.id,
          message:
            "لم تتوفر مدة " +
            l.title +
            "؛ لا تدخل في حساب وقت المشاهدة حتى تُستخرج.",
        });
        continue;
      }
      if (video) {
        for (const [from, to] of missingRanges(duration.seconds, ranges)) {
          let start = from;
          while (start < to) {
            const end = Math.min(to, start + maxWatch),
              id = taskId("watch", c.id, l.id, start, end);
            add({
              ...base,
              id,
              kind: "watch",
              title: l.title,
              seconds: Math.ceil(end - start),
              estimated: duration.estimated,
              source: {
                start,
                end,
                total: duration.seconds,
                durationSource: duration.source,
                segmented: start > 0 || end < duration.seconds,
              },
              dependencies: previousWatch ? [previousWatch] : [],
            });
            watchIds.push(id);
            previousWatch = id;
            start = end;
          }
        }
      } else if (!readDone) {
        const id = taskId("read", c.id, l.id);
        add({
          ...base,
          id,
          kind: "read",
          title: l.title,
          seconds: duration.seconds,
          estimated: true,
          source: { durationSource: duration.source },
          dependencies: previousWatch ? [previousWatch] : [],
        });
        watchIds = [id];
        previousWatch = id;
      }
      if (!watchByTrack.has(c.trackId)) watchByTrack.set(c.trackId, []);
      watchByTrack.get(c.trackId).push(...watchIds);
      const topic = l.topicId || "general";
      topicWatches.set(topic, [
        ...(topicWatches.get(topic) || []),
        ...watchIds,
      ]);
      const ids = [
        ...new Set(
          [l.questionId, ...(l.practiceQuestionIds || [])].filter((id) =>
            content.questions.some((q) => q.id === id),
          ),
        ),
      ];
      const seconds = ids.length
        ? Math.round(
            ids.length *
              rules.questionSeconds *
              (profile.selfLevel === "beginner" ? 1.25 : 1),
          )
        : rules.offlinePracticeMinutes * 60;
      add({
        ...base,
        id: taskId("practice", c.id, l.id),
        kind: "practice",
        title: ids.length ? "تطبيق على " + l.title : "تدريب ذاتي: " + l.title,
        seconds,
        estimated: true,
        source: { questionIds: ids, offline: !ids.length },
        dependencies: watchIds,
      });
    }
    for (const t of content.tests || []) {
      if (
        !testVisible(content, t) ||
        t.level !== "topic" ||
        (t.courseId && t.courseId !== c.id) ||
        (!t.courseId && !(t.trackIds || []).includes(c.trackId)) ||
        !t.questionIds.length
      )
        continue;
      const deps = t.topicId
        ? topicWatches.get(t.topicId)
        : [...topicWatches.values()].flat();
      if (deps)
        topicCandidates.push({
          id: taskId("topic-test", t.id, c.id),
          courseId: c.id,
          trackId: c.trackId,
          stage: c.stage || "foundation",
          kind: "test",
          title: t.title,
          seconds: t.duration,
          source: {
            testId: t.id,
            level: "topic",
            questionCount: t.questionIds.length,
          },
          dependencies: deps,
        });
    }
  }
  for (const t of topicCandidates) add(t);
  // Planning order is pedagogical; watching still never sets a mastery score.
  if (profile.foundationCompleted !== true) {
    for (const task of tasks)
      if (task.stage === "training" && task.kind === "watch")
        task.dependencies = [
          ...new Set([
            ...task.dependencies,
            ...(watchByTrack.get(task.trackId) || []).filter(
              (id) => tasks.find((t) => t.id === id)?.stage === "foundation",
            ),
          ]),
        ];
  }
  const examDate = profile.examDate || null,
    horizon =
      examDate && examDate > today
        ? Math.min(
            730,
            Math.ceil(
              (Date.parse(examDate + "T12:00Z") -
                Date.parse(today + "T12:00Z")) /
                86400000,
            ),
          )
        : examDate
          ? 0
          : rules.planningDays;
  const dates = [];
  if (budget && weekdays.length)
    for (let i = 0; i < horizon; i++) {
      const date = addDays(today, i);
      if (weekdays.includes(dayNumber(date))) dates.push(date);
    }
  if (!examDate)
    warnings.push({
      code: "exam-date",
      message:
        "الخطة الحالية مرحلية؛ حدّد موعد الاختبار لحساب ملاءمتها للموعد.",
    });
  if (examDate && examDate <= today)
    warnings.push({
      code: "exam-past",
      message: "موعد الاختبار اليوم أو مضى. حدّث الموعد لإعادة توزيع المهام.",
    });
  const selectedTracks = new Set(courses.map((c) => c.trackId));
  const weekTests = (content.tests || []).filter(
    (t) =>
      testVisible(content, t) &&
      t.level === "weekly" &&
      (t.trackIds || []).some((id) => selectedTracks.has(id)),
  );
  if (courses.length && !weekTests.length)
    warnings.push({
      code: "weekly-test",
      message: "لا يوجد اختبار أسبوعي منشور لهذه المسارات بعد.",
    });
  const scheduled = [],
    assigned = new Set(completed),
    spent = new Map(),
    dayInfo = [];
  const calendarWeek = (d) => addDays(d, -((dayNumber(d) + 1) % 7));
  const weekEnds = new Set(
    dates.filter(
      (d, i) => !dates[i + 1] || calendarWeek(d) !== calendarWeek(dates[i + 1]),
    ),
  );
  function weight(task) {
    const m = mastery.find((x) => x.trackId === task.trackId);
    let w = m?.total >= 5 && m.correct / m.total < 0.7 ? 1.6 : 1;
    if (profile.foundationCompleted === true)
      w *= task.stage === "training" ? 1.25 : 0.85;
    return w;
  }
  const unscheduledReserved = [];
  let weekIndex = 0;
  for (const [dayIndex, date] of dates.entries()) {
    const dayBudget = Math.max(
      0,
      budget - (date === today ? completedTodaySeconds : 0),
    );
    const reserved = [];
    if (weekTests.length && weekEnds.has(date)) {
      const t = weekTests[weekIndex++ % weekTests.length];
      reserved.push({
        id: taskId("weekly", t.id, date),
        trackId: t.trackIds[0],
        stage: "review",
        kind: "test",
        title: t.title,
        seconds: t.duration,
        source: {
          testId: t.id,
          level: "weekly",
          questionCount: t.questionIds.length,
        },
        dependencies: [],
      });
    }
    if (mistakeIds.length && dayIndex % 2 === 1)
      reserved.push({
        id: taskId("mistakes", date),
        trackId: "review",
        stage: "review",
        kind: "review",
        title: "مراجعة أخطاء مسجلة",
        seconds: Math.min(
          rules.reviewMinutes * 60,
          mistakeIds.length * rules.questionSeconds,
        ),
        estimated: true,
        source: { questionIds: mistakeIds, review: "mistakes" },
        dependencies: [],
      });
    if (examDate && dayIndex >= dates.length - 2 && courses.length)
      reserved.push({
        id: taskId("final-review", date),
        trackId: "review",
        stage: "review",
        kind: "review",
        title: "مراجعة عامة قبل الاختبار",
        seconds: Math.min(
          rules.finalReviewMinutes * 60,
          Math.floor(budget * 0.2),
        ),
        estimated: true,
        source: { courseIds: courses.map((c) => c.id), review: "general" },
        dependencies: [],
      });
    const dayTasks = [];
    let used = 0,
      block = 0;
    const append = (t) => {
      const needsBreak =
          block > 0 && block + t.seconds > rules.breakEveryMinutes * 60,
        cost = t.seconds + (needsBreak ? rules.breakMinutes * 60 : 0);
      if (used + cost > dayBudget) return false;
      if (needsBreak) {
        dayTasks.push({
          id: taskId("break", date, t.id),
          kind: "break",
          title: "استراحة قصيرة",
          seconds: rules.breakMinutes * 60,
          source: {},
          trackId: "break",
          stage: "review",
          scheduledDate: date,
          estimated: true,
        });
        used += rules.breakMinutes * 60;
        block = 0;
      }
      dayTasks.push({ ...t, scheduledDate: date });
      used += t.seconds;
      block += t.seconds;
      assigned.add(t.id);
      return true;
    };
    // Reserve assessments first so content cannot make a day exceed the student's budget.
    for (const t of reserved) {
      if (completed.has(t.id)) continue;
      if (!append(t)) {
        unscheduledReserved.push(t);
        warnings.push({
          code: "assessment-budget",
          message:
            "مدة " +
            t.title +
            " لا تتسع لها ميزانية " +
            date +
            "؛ لم يُفرض على اليوم.",
        });
      }
    }
    let iterations = 0;
    while (iterations++ < tasks.length + 1) {
      const candidates = [];
      for (const [lane, queue] of lanes) {
        const t = queue.find(
          (t) =>
            !assigned.has(t.id) &&
            t.dependencies.every((id) => assigned.has(id) || !allIds.has(id)),
        );
        if (t)
          candidates.push({
            lane,
            t,
            score: (spent.get(lane) || 0) / weight(t),
          });
      }
      candidates.sort(
        (a, b) => a.score - b.score || a.t.id.localeCompare(b.t.id),
      );
      let found = false;
      for (const c of candidates) {
        const needsBreak =
          block > 0 && block + c.t.seconds > rules.breakEveryMinutes * 60;
        if (
          c.t.seconds + (needsBreak ? rules.breakMinutes * 60 : 0) >
          dayBudget - used
        )
          continue;
        if (append(c.t)) {
          spent.set(c.lane, (spent.get(c.lane) || 0) + c.t.seconds);
          found = true;
          break;
        }
      }
      if (!found) break;
    }
    scheduled.push(...dayTasks);
    dayInfo.push({
      date,
      capacitySeconds: dayBudget,
      scheduledSeconds: used,
      studySeconds: dayTasks
        .filter((t) => t.kind !== "break")
        .reduce((n, t) => n + t.seconds, 0),
    });
  }
  const remaining = [
    ...tasks.filter((t) => !assigned.has(t.id)),
    ...unscheduledReserved,
  ];
  const unknown = remaining.filter((t) => t.unknown),
    overflow = remaining.filter((t) => !t.unknown);
  if (overflow.length)
    warnings.push({
      code: "capacity",
      message:
        "المحتوى المتبقي يتجاوز الوقت المتاح حاليًا. زد الوقت أو الأيام أو قلّل الدورات؛ لن نحمّل يومك فوق طاقته.",
    });
  return {
    tasks: [
      ...scheduled,
      ...remaining.map((t) => ({ ...t, scheduledDate: null })),
    ],
    days: dayInfo,
    warnings,
    summary: {
      generatedFor: today,
      examDate,
      availableDays: dates.length,
      dailySeconds: budget,
      completedTodaySeconds,
      remainingTodaySeconds: Math.max(0, budget - completedTodaySeconds),
      contentSeconds: tasks.reduce((n, t) => n + t.seconds, 0),
      scheduledSeconds: scheduled.reduce((n, t) => n + t.seconds, 0),
      remainingSeconds: overflow.reduce((n, t) => n + t.seconds, 0),
      unknownDurationCount: unknown.length,
      overflowCount: overflow.length,
      selectedCourses: courses.length,
      estimatedTasks: tasks.filter((t) => t.estimated).length,
      feasible: !!courses.length && !!dates.length && !remaining.length,
      deadlineKnown: !!examDate,
      planningHorizonDays: horizon,
    },
  };
}

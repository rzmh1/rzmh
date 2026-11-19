import { createHash } from "node:crypto";
export const STAGES = ["foundation", "training", "review"];
export const DEFAULT_RULES = {
  questionSeconds: 90,
  offlinePracticeMinutes: 8,
  reviewMinutes: 10,
  breakEveryMinutes: 45,
  breakMinutes: 5,
  maxWatchBlockMinutes: 45,
  finalReviewMinutes: 20,
  planningDays: 120,
};
export function todayKey(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export const addDays = (date, n) => {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const dayNumber = (date) => new Date(date + "T12:00:00Z").getUTCDay();
export const sectionVisible = (content, id) =>
  content.sections.some((s) => s.id === id && s.visible);
export const trackVisible = (content, id) =>
  !id ||
  (content.tracks || []).some(
    (t) =>
      t.id === id &&
      t.visible &&
      !t.coming &&
      sectionVisible(content, t.sectionId),
  );
export const courseVisible = (content, c) =>
  !!c &&
  c.visible &&
  sectionVisible(content, c.sectionId) &&
  trackVisible(content, c.trackId);
export const questionVisible = (content, q) =>
  !!q &&
  sectionVisible(content, q.sectionId) &&
  trackVisible(content, q.trackId);
export const testVisible = (content, t) =>
  !!t &&
  t.visible &&
  (!t.courseId ||
    courseVisible(
      content,
      content.courses.find((c) => c.id === t.courseId),
    )) &&
  (t.trackIds || []).every((id) => trackVisible(content, id)) &&
  t.questionIds.every((id) =>
    questionVisible(
      content,
      content.questions.find((q) => q.id === id),
    ),
  );
export const taskId = (...values) =>
  createHash("sha256").update(values.join("|")).digest("hex").slice(0, 32);
export function mergeRanges(ranges) {
  const sorted = ranges
    .filter(
      (r) =>
        Array.isArray(r) &&
        r.length === 2 &&
        Number.isFinite(r[0]) &&
        Number.isFinite(r[1]) &&
        r[1] > r[0],
    )
    .map((r) => [...r])
    .sort((a, b) => a[0] - b[0]);
  const result = [];
  for (const range of sorted) {
    const last = result.at(-1);
    if (last && range[0] <= last[1] + 0.01)
      last[1] = Math.max(last[1], range[1]);
    else result.push(range);
  }
  return result;
}
export const coveredSeconds = (ranges) =>
  mergeRanges(ranges).reduce((n, r) => n + r[1] - r[0], 0);
export function missingRanges(duration, ranges) {
  const result = [];
  let cursor = 0;
  for (const [start, end] of mergeRanges(ranges)) {
    if (start > cursor) result.push([cursor, Math.min(start, duration)]);
    cursor = Math.max(cursor, end);
    if (cursor >= duration) break;
  }
  if (cursor < duration) result.push([cursor, duration]);
  return result.filter(([a, b]) => b > a);
}
export function normalizeContent(input) {
  const hadTracks = Array.isArray(input.tracks),
    c = structuredClone(input);
  c.tracks ||= [];
  const definitions = {
    qudrat: [
      ["quant", "القدرات الكمي", "كمي"],
      ["verbal", "القدرات اللفظي", "لفظي"],
    ],
    tahsili: [
      ["math", "الرياضيات", "رياضيات"],
      ["physics", "الفيزياء", "فيزياء"],
      ["chemistry", "الكيمياء", "كيمياء"],
      ["biology", "الأحياء", "أحياء"],
    ],
    step: [["english", "STEP", "اللغة الإنجليزية"]],
  };
  for (const section of c.sections) {
    for (const [key, title, subject] of !hadTracks
      ? definitions[section.id] || []
      : []) {
      const id = section.id + "-" + key;
      if (!c.tracks.some((t) => t.id === id))
        c.tracks.push({
          id,
          sectionId: section.id,
          title,
          subject,
          visible: true,
          order: c.tracks.length + 1,
          coming: section.status === "coming",
        });
    }
  }
  for (const course of c.courses) {
    let track =
      c.tracks.find((t) => t.id === course.trackId) ||
      c.tracks.find(
        (t) => t.sectionId === course.sectionId && t.subject === course.subject,
      );
    if (!track && course.subject) {
      track = {
        id: "track-" + taskId(course.sectionId, course.subject).slice(0, 12),
        sectionId: course.sectionId,
        title: course.subject,
        subject: course.subject,
        visible: true,
        order: c.tracks.length + 1,
      };
      c.tracks.push(track);
    }
    course.trackId ||= track?.id || "";
    course.stage ||= "foundation";
    course.instructorId ||= "";
    course.lessons.forEach((l, i) => {
      l.order ??= i + 1;
      l.topicId ??= "";
      l.practiceQuestionIds ??= [];
    });
  }
  for (const q of c.questions) {
    q.trackId ||=
      c.tracks.find(
        (t) => t.sectionId === q.sectionId && t.subject === q.subject,
      )?.id || "";
    q.topicId ||= "";
  }
  for (const t of c.tests || []) {
    t.level ||= "general";
    if (!t.trackIds?.length)
      t.trackIds = [
        ...new Set(
          t.questionIds
            .map((id) => c.questions.find((q) => q.id === id)?.trackId)
            .filter(Boolean),
        ),
      ];
    t.topicId ||= "";
  }
  return c;
}
export function lessonDuration(lesson, rules = DEFAULT_RULES) {
  if (lesson.videoAssetId)
    return Number.isFinite(lesson.durationSeconds) && lesson.durationSeconds > 0
      ? {
          seconds: Math.ceil(lesson.durationSeconds),
          source: lesson.durationSource || "video",
          estimated: false,
        }
      : { seconds: null, source: "missing-video-duration", estimated: false };
  if (lesson.videoUrl)
    return lesson.estimatedMinutes > 0
      ? {
          seconds: Math.ceil(lesson.estimatedMinutes * 60),
          source: "manual-estimate",
          estimated: true,
        }
      : { seconds: null, source: "missing-video-duration", estimated: false };
  if (lesson.estimatedMinutes > 0)
    return {
      seconds: Math.ceil(lesson.estimatedMinutes * 60),
      source: "manual-estimate",
      estimated: true,
    };
  const words = ((lesson.body || "") + " " + (lesson.example || ""))
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return words
    ? {
        seconds: Math.max(60, Math.ceil((words / 150) * 60)),
        source: "reading-estimate",
        estimated: true,
      }
    : { seconds: null, source: "missing-content-duration", estimated: false };
}

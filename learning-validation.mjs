import { normalizeContent, STAGES } from "./learning-model.mjs";
import { fail } from "./security.mjs";
export function validateLearningContent(store, data) {
  const previous = store.getContent();
  const normalized = normalizeContent(data);
  Object.assign(data, normalized);
  const trackIds = new Set();
  for (const t of data.tracks) {
    if (
      !/^[\w-]{1,100}$/.test(t.id) ||
      trackIds.has(t.id) ||
      typeof t.title !== "string" ||
      !t.title.trim() ||
      typeof t.subject !== "string" ||
      typeof t.visible !== "boolean" ||
      !Number.isFinite(t.order) ||
      !data.sections.some((s) => s.id === t.sectionId)
    )
      fail(400, "بيانات مسار التعلم غير صالحة");
    trackIds.add(t.id);
  }
  for (const c of data.courses) {
    if (
      !trackIds.has(c.trackId) ||
      !data.tracks.some(
        (t) => t.id === c.trackId && t.sectionId === c.sectionId,
      ) ||
      !STAGES.includes(c.stage)
    )
      fail(400, "اربط الدورة بمسار ومرحلة صالحين");
    if (
      c.instructorId &&
      !store.db
        .prepare("SELECT id FROM instructors WHERE id=?")
        .get(c.instructorId)
    )
      fail(400, "المدرس أو المصدر غير موجود");
    for (const l of c.lessons) {
      if (
        l.estimatedMinutes != null &&
        (!Number.isFinite(l.estimatedMinutes) ||
          l.estimatedMinutes <= 0 ||
          l.estimatedMinutes > 2400)
      )
        fail(400, "وقت الدرس التقديري غير صالح");
      if (l.topicId && typeof l.topicId !== "string")
        fail(400, "معرف الموضوع غير صالح");
      if (l.practiceQuestionIds && !Array.isArray(l.practiceQuestionIds))
        fail(400, "أسئلة الدرس غير صالحة");
    }
  }
  for (const t of data.tests || []) {
    if (
      !["general", "diagnostic", "lesson", "topic", "daily", "weekly"].includes(
        t.level,
      )
    )
      fail(400, "مستوى الاختبار غير صالح");
    t.questionIds = [...new Set(t.questionIds)];
    if (
      t.visible &&
      t.level === "topic" &&
      (t.questionIds.length < 5 || t.questionIds.length > 10)
    )
      fail(400, "اختبار الموضوع المنشور يتكون من ٥ إلى ١٠ أسئلة");
    if (t.visible && t.level === "weekly") {
      const qs = t.questionIds
        .map((id) => data.questions.find((q) => q.id === id))
        .filter(Boolean);
      if (
        qs.some((q) => q.sectionId === "qudrat") &&
        (!qs.some((q) => q.trackId === "qudrat-quant") ||
          !qs.some((q) => q.trackId === "qudrat-verbal"))
      )
        fail(400, "اختبار القدرات الأسبوعي يجب أن يقيس الكمي واللفظي معًا");
    }
  }
  for (const u of data.updates) {
    const old = previous.updates.find((x) => x.id === u.id);
    const changed =
      !old ||
      [
        "title",
        "body",
        "type",
        "testId",
        "courseId",
        "lessonId",
        "sectionId",
        "visible",
        "assetId",
        "free",
      ].some((k) => u[k] !== old[k]);
    if (changed && u.visible !== false && u.rightsConfirmed !== true)
      fail(400, "أكد أن مواد التحديث مصرح باستخدامها قبل النشر");
    if (
      u.assetId &&
      !store.db
        .prepare("SELECT id FROM assets WHERE id=? AND status='ready'")
        .get(u.assetId)
    )
      fail(400, "ملف التحديث غير جاهز");
    if (u.sectionId && !data.sections.some((s) => s.id === u.sectionId))
      fail(400, "قسم التحديث غير صالح");
    if (u.testId && !data.tests.some((t) => t.id === u.testId))
      fail(400, "اختبار التحديث غير موجود");
    if (u.courseId && !data.courses.some((c) => c.id === u.courseId))
      fail(400, "دورة التحديث غير موجودة");
  }
}

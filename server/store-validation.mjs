import { storeSections } from "../dist/store-config.js";
import { fail } from "./security.mjs";
export function validateStore(store, data) {
  for (const c of data.courses)
    if (
      Object.hasOwn(c, "previewLessonId") &&
      c.previewLessonId !== null &&
      (typeof c.previewLessonId !== "string" ||
        !c.lessons.some((l) => l.id === c.previewLessonId))
    )
      fail(400, "حدد مقطع معاينة موجودًا في الدورة، أو ألغِ المعاينة.");
  const v = data.storefront;
  if (v === undefined) return;
  const text = (s, max) => typeof s === "string" && s.length <= max;
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(400, "إعدادات المتجر غير صالحة");
  if (
    !Array.isArray(v.sections) ||
    v.sections.length !== storeSections.length ||
    new Set(v.sections.map((s) => s.id)).size !== storeSections.length
  )
    fail(400, "أقسام المتجر غير مكتملة");
  for (const s of v.sections)
    if (
      !storeSections.some((x) => x.id === s.id) ||
      !text(s.title, 160) ||
      !s.title.trim() ||
      !text(s.eyebrow, 100) ||
      !text(s.description, 500) ||
      !Number.isInteger(s.order) ||
      s.order < 1 ||
      s.order > 99 ||
      typeof s.visible !== "boolean"
    )
      fail(400, "بيانات قسم المتجر غير صالحة");
  if (
    !text(v.foundation, 1000) ||
    !text(v.training, 1000) ||
    !text(v.supportEmail, 254) ||
    (v.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.supportEmail))
  )
    fail(400, "راجع نصوص المتجر وبريد التواصل");
  if (
    !Array.isArray(v.faq) ||
    v.faq.length > 12 ||
    v.faq.some(
      (a) =>
        !Array.isArray(a) ||
        a.length !== 2 ||
        !text(a[0], 200) ||
        !a[0].trim() ||
        !text(a[1], 1500) ||
        !a[1].trim(),
    )
  )
    fail(400, "بيانات الأسئلة الشائعة غير صالحة");
  for (const [key, exists] of [
    ["featuredCourseIds", (id) => data.courses.some((c) => c.id === id)],
    [
      "featuredInstructorIds",
      (id) =>
        !!store.db.prepare("SELECT id FROM instructors WHERE id=?").get(id),
    ],
  ])
    if (
      !Array.isArray(v[key]) ||
      v[key].length > 100 ||
      v[key].some((id) => typeof id !== "string" || !exists(id))
    )
      fail(400, "اختيارات بطاقات المتجر غير صالحة");
}

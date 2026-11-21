// One published preview per course. Legacy flags remain stored; the first free
// lesson is used until the owner explicitly selects a preview (or selects none).
export function previewLessonId(course) {
  const lessons = (course.lessons || [])
    .filter((l) => l.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));
  const id = Object.hasOwn(course, "previewLessonId")
    ? course.previewLessonId
    : lessons.find((l) => l.free)?.id;
  return typeof id === "string" && lessons.some((l) => l.id === id) ? id : null;
}
export const isPreview = (course, lesson) =>
  previewLessonId(course) === lesson.id;
export const canReadLesson = (course, lesson, user, entitled = false) =>
  !!user &&
  !!lesson &&
  lesson.visible !== false &&
  (user.role === "admin" ||
    entitled ||
    course.access === "free" ||
    isPreview(course, lesson));
export function authLink(signup, next = "/") {
  return (
    "#/" + (signup ? "signup" : "login") + "?next=" + encodeURIComponent(next)
  );
}
export function safeNext(value) {
  if (
    typeof value !== "string" ||
    value.length > 600 ||
    !/^\/(?:admin|course\/[\w-]+(?:\?preview=[\w-]+)?|subscription(?:\/[\w-]+)?|sections|section\/[\w-]+|track\/[\w-]+|instructors|instructor\/[\w-]+)?$/.test(
      value,
    )
  )
    return null;
  return "#" + value;
}
export function afterAuthRoute(session, next) {
  const target = safeNext(next);
  if (target === "#/admin") {
    if (session.user?.role === "admin") return target;
    return session.entitled ? "#/dashboard" : "#/sections";
  }
  return (
    target ||
    (session.user?.role === "admin"
      ? "#/admin"
      : session.entitled
        ? "#/dashboard"
        : "#/sections")
  );
}

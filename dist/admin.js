import { mountStoreAdmin } from "./store-admin.js";
import { previewLessonId } from "./course-policy.js";
import { mountLearningAdmin } from "./learning-admin.js";
import { api } from "./api.js";
import { mountAdminLive } from "./admin-live.js";
import {
  db,
  saveDb,
  resetDb,
  importDb,
  defaults,
  escape as e,
  safeUrl,
  sectionName,
  money,
} from "./data.js";
import { icon, btn, notice, pageHeading, empty, badge } from "./ui.js";
let tab = "overview";
const tabs = [
  ["overview", "لوحة المعلومات"],
  ["sections", "الأقسام"],
  ["learning-tracks", "مسارات التعلم والمواد"],
  ["instructors", "المدرسون والمصادر"],
  ["scheduler", "قواعد الجدولة"],
  ["courses", "الدورات والدروس"],
  ["questions", "بنك الأسئلة"],
  ["tests", "الاختبارات"],
  ["updates", "التحديثات والتجميعات"],
  ["leaks", "إدارة التسريبات"],
  ["community", "مجتمع رُزمة"],
  ["broadcasts", "رسائل المشتركين"],
  ["uploads", "الفيديوهات والملفات"],
  ["brand", "الهوية والرئيسية"],
  ["storefront", "إدارة واجهة المتجر"],
  ["plans", "الباقات والأسعار"],
  ["students", "الطلاب والاشتراكات"],
  ["custom", "التخصيص المتقدم"],
  ["payment", "بوابات الدفع"],
  ["ai", "المدرس الذكي"],
  ["audit", "سجل الأحداث"],
  ["backups", "النسخ الاحتياطية"],
  ["data", "نسخ البيانات"],
];
export function adminPage() {
  return `<div class="admin-shell"><aside class="admin-nav"><div class="admin-nav-brand">${icon("layers")}<div>رُزمة <small>لوحة المالك</small></div></div>${tabs.map(([id, title]) => `<button data-admin-tab="${id}" class="${tab === id ? "active" : ""}">${title}</button>`).join("")}</aside><section id="admin-content">${content()}</section></div>`;
}
const table = (heads, rows) =>
  `<div class="admin-table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
const actions = (type, id) =>
  `<div class="table-actions"><button class="btn btn-outline" data-edit="${type}" data-id="${id}">تعديل</button><button class="btn btn-outline danger" data-delete="${type}" data-id="${id}">حذف</button></div>`;
const bar = (title, type) =>
  `<div class="admin-bar"><h2>${title}</h2>${type ? `<button class="btn btn-primary btn-sm" data-edit="${type}">${icon("plus")} إضافة</button>` : ""}</div>`;
function content() {
  if (
    [
      "overview",
      "storefront",
      "instructors",
      "learning-tracks",
      "scheduler",
      "students",
      "leaks",
      "community",
      "broadcasts",
      "uploads",
      "custom",
      "payment",
      "ai",
      "audit",
      "backups",
    ].includes(tab)
  )
    return '<div id="live-admin-root"><p class="muted">جارٍ تحميل البيانات…</p></div>';
  if (tab === "sections")
    return (
      bar("الأقسام", "sections") +
      table(
        ["القسم", "الحالة", "الترتيب", "الإجراءات"],
        db.sections.map(
          (s) =>
            `<tr><td>${e(s.title)}<br><small>${s.subjects.map(e).join(" · ")}</small></td><td>${s.visible ? "ظاهر" : "مخفي"} · ${s.status === "coming" ? "قريبًا" : "تجريبي"}</td><td>${s.order}</td><td>${actions("sections", s.id)}</td></tr>`,
        ),
      )
    );
  if (tab === "courses")
    return (
      bar("الدورات", "courses") +
      table(
        ["الدورة", "القسم", "الدروس", "الإجراءات"],
        db.courses.map(
          (c) =>
            `<tr><td>${e(c.title)}<br><small>${c.visible ? "ظاهر" : "مخفي"} · ${c.access === "paid" ? "مدفوع" : "مجاني"}</small></td><td>${e(sectionName(c.sectionId))}</td><td><button class="btn btn-outline" data-lessons="${c.id}">${c.lessons.length} · إدارة الدروس</button></td><td>${actions("courses", c.id)}</td></tr>`,
        ),
      )
    );
  if (tab === "questions")
    return (
      bar("الأسئلة", "questions") +
      table(
        ["السؤال", "المادة", "الإجراءات"],
        db.questions.map(
          (q) =>
            `<tr><td>${e(q.text.slice(0, 55))}…</td><td>${e(q.subject)}</td><td>${actions("questions", q.id)}</td></tr>`,
        ),
      )
    );
  if (tab === "tests")
    return (
      bar("الاختبارات", "tests") +
      table(
        ["الاختبار", "الأسئلة", "الوقت", "الحالة", "الإجراءات"],
        (db.tests || []).map(
          (t) =>
            `<tr><td>${e(t.title)}</td><td>${t.questionIds.length}</td><td>${t.duration} ثانية</td><td>${t.visible ? "ظاهر" : "مخفي"}</td><td>${actions("tests", t.id)}</td></tr>`,
        ),
      )
    );
  if (tab === "updates")
    return (
      bar("التحديثات والتجميعات", "updates") +
      (db.updates.length
        ? table(
            ["التحديث", "النوع", "آخر تعديل فعلي", "الإجراءات"],
            db.updates.map(
              (u) =>
                `<tr><td>${e(u.title)}</td><td>${e(u.type)}</td><td>${new Date(u.updatedAt).toLocaleString("ar-SA")}</td><td>${actions("updates", u.id)}</td></tr>`,
            ),
          )
        : empty(
            "لا توجد تحديثات منشورة",
            "أضف أول تحديث، وسيظهر تاريخه الفعلي في واجهة المتجر.",
            "calendar",
          ))
    );
  if (tab === "brand")
    return (
      bar("الهوية والصفحة الرئيسية") +
      `<form id="brand-form" class="panel"><div class="form-grid">${field("name", "اسم المنصة", db.brand.name)}${field("color", "لون الهوية", db.brand.color, "color")}${field("hero", "عنوان الواجهة (سطران)", db.brand.hero, "textarea")}${field("description", "وصف الواجهة", db.brand.description, "textarea")}${field("logo", "رابط الشعار (اختياري)", db.brand.logo, "url")}${field("logoDark", "نسخة الشعار للوضع الليلي (اختياري، من الهوية نفسها)", db.brand.logoDark, "url")}${field("heroImage", "رابط صورة الواجهة (اختياري)", db.brand.heroImage, "url")}</div><button type="submit" class="btn btn-primary">حفظ الهوية ${icon("check")}</button><p class="muted spaced">اترك روابط الصور فارغة لاستخدام الشعار النصي والرسم الأصلي. يُفضّل مصدر HTTPS موثوق.</p></form>`
    );
  if (tab === "plans")
    return (
      bar("المدد والأسعار") +
      table(
        ["المدة", "الأشهر", "السعر", "الإجراءات"],
        db.plans.map(
          (p) =>
            `<tr><td>${e(p.title)}</td><td>${p.months}</td><td>${money(p.price)} ريال</td><td><span>سعر معتمد وثابت</span></td></tr>`,
        ),
      )
    );
  if (tab === "data")
    return (
      bar("بيانات منظمة، وقابلة للنقل") +
      `<div class="panel"><h3>نسخة من المحتوى</h3><p>تصدير الأقسام والدورات والدروس والأسئلة والتحديثات والهوية والأسعار إلى JSON. لا يشمل الملف تقدم الطالب أو رسومات المسودة.</p><div class="modal-actions"><button class="btn btn-primary" data-admin-action="export">تصدير JSON ${icon("download")}</button><label class="btn btn-outline" for="import-file">استيراد JSON ${icon("upload")}</label><input type="file" id="import-file" accept="application/json" class="hidden"></div><div class="spaced">${notice("الاستيراد يستبدل المحتوى الحالي الحالي. صدّر نسخة احتياطية قبل الاستيراد.", "file")}</div><button class="btn btn-outline danger" data-admin-action="reset">استعادة محتوى النموذج الأصلي</button></div>`
    );
}
function field(name, label, value = "", type = "text", extra = "") {
  return `<div class="field"><label for="f-${name}">${label}</label>${type === "textarea" ? `<textarea id="f-${name}" name="${name}" ${extra}>${e(value)}</textarea>` : `<input id="f-${name}" name="${name}" type="${type}" value="${e(value)}" ${extra}>`}</div>`;
}
function select(name, label, options, value) {
  return `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}">${options.map(([v, t]) => `<option value="${e(v)}" ${v === value ? "selected" : ""}>${e(t)}</option>`).join("")}</select></div>`;
}
function checked(name, label, value) {
  return `<label class="checkbox field"><input name="${name}" type="checkbox" ${value ? "checked" : ""}><span>${label}</span></label>`;
}
const modal = document.querySelector("#modal");
function showDialog(title, body) {
  modal.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon("close")}</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
async function editForm(type, id, courseId) {
  const [assets, instructors] = await Promise.all([
    api("/api/admin/assets"),
    api("/api/admin/learning/instructors"),
  ]);
  const row =
    type === "lessons"
      ? db.courses
          .find((c) => c.id === courseId)
          ?.lessons.find((l) => l.id === id)
      : db[type]?.find((v) => v.id === id);
  const r = row || {};
  let fields = "";
  if (type === "sections")
    fields =
      field("title", "اسم القسم", r.title, "text", 'required maxlength="60"') +
      field("label", "عبارة قصيرة", r.label) +
      field("description", "الوصف", r.description, "textarea") +
      field(
        "subjects",
        "الأقسام الفرعية — مفصولة بفاصلة عربية",
        r.subjects?.join("، "),
      ) +
      field(
        "order",
        "الترتيب",
        r.order || db.sections.length + 1,
        "number",
        'min="1" required',
      ) +
      select(
        "icon",
        "الأيقونة",
        [
          ["shapes", "قدرات"],
          ["atom", "علوم"],
          ["language", "لغة"],
        ],
        r.icon,
      ) +
      select(
        "status",
        "الحالة",
        [
          ["active", "متاح"],
          ["demo", "تجريبي"],
          ["coming", "قريبًا"],
        ],
        r.status,
      ) +
      checked("visible", "إظهار القسم في الموقع", r.visible ?? true);
  if (type === "courses")
    fields =
      field("title", "اسم الدورة", r.title, "text", "required") +
      select(
        "sectionId",
        "القسم",
        db.sections.map((s) => [s.id, s.title]),
        r.sectionId,
      ) +
      field("subject", "المادة", r.subject, "text", "required") +
      field("description", "الوصف", r.description, "textarea") +
      field("status", "حالة الدورة", r.status || "نموذج توضيحي") +
      select(
        "art",
        "الرسم",
        [
          ["math", "رياضيات"],
          ["letters", "لفظي"],
          ["physics", "علوم"],
        ],
        r.art,
      ) +
      select(
        "thumbnailAssetId",
        "صورة الدورة من المكتبة",
        [
          ["", "بدون"],
          ...assets
            .filter(
              (a) =>
                a.mime.startsWith("image/") && a.status === "ready" && a.public,
            )
            .map((a) => [a.id, a.name]),
        ],
        r.thumbnailAssetId || "",
      ) +
      field("thumbnail", "رابط صورة خارجي اختياري", r.thumbnail, "url") +
      field(
        "order",
        "الترتيب",
        r.order || db.courses.length + 1,
        "number",
        'min="1" required',
      ) +
      select(
        "access",
        "الوصول",
        [
          ["paid", "ضمن الاشتراك الشامل"],
          ["free", "مجاني"],
        ],
        r.access,
      ) +
      checked("visible", "إظهار الدورة", r.visible ?? true);
  if (type === "courses")
    fields =
      select(
        "previewLessonId",
        "مقطع المعاينة المجانية — يتطلب حسابًا",
        [["", "بدون معاينة"], ...(r.lessons || []).map((l) => [l.id, l.title])],
        previewLessonId(r) || "",
      ) + fields;
  if (type === "lessons")
    fields =
      field("title", "عنوان الدرس", r.title, "text", "required") +
      field("body", "الشرح النصي", r.body, "textarea", "required") +
      field("example", "مثال محلول", r.example, "textarea") +
      select(
        "videoAssetId",
        "فيديو من المكتبة",
        [
          ["", "بدون"],
          ...assets
            .filter((a) => a.mime.startsWith("video/"))
            .map((a) => [a.id, a.name]),
        ],
        r.videoAssetId || "",
      ) +
      field(
        "order",
        "ترتيب الدرس",
        r.order || 1,
        "number",
        'required min="1"',
      ) +
      checked("visible", "إظهار الدرس", r.visible ?? true) +
      select(
        "questionId",
        "سؤال مرتبط (اختياري)",
        [["", "بدون"], ...db.questions.map((q) => [q.id, q.text.slice(0, 45)])],
        r.questionId || "",
      ) +
      checked(
        "free",
        "استخدام هذا الدرس للمعاينة المجانية (يتطلب حسابًا)",
        previewLessonId(
          db.courses.find((c) => c.id === courseId) || { lessons: [] },
        ) === r.id,
      );
  if (type === "questions")
    fields =
      select(
        "access",
        "الوصول",
        [
          ["free", "مجاني"],
          ["paid", "للمشتركين"],
        ],
        r.access || "paid",
      ) +
      field("text", "نص السؤال", r.text, "textarea", "required") +
      select(
        "sectionId",
        "القسم",
        db.sections.map((s) => [s.id, s.title]),
        r.sectionId,
      ) +
      field("subject", "المادة", r.subject, "text", "required") +
      [0, 1, 2, 3]
        .map((i) =>
          field(
            "option" + i,
            "الخيار " + (i + 1),
            r.options?.[i],
            "text",
            "required",
          ),
        )
        .join("") +
      select(
        "correct",
        "الإجابة الصحيحة",
        [0, 1, 2, 3].map((i) => [String(i), "الخيار " + (i + 1)]),
        String(r.correct ?? 0),
      ) +
      field(
        "explanation",
        "شرح الإجابة",
        r.explanation,
        "textarea",
        "required",
      );
  if (type === "updates")
    fields =
      field("title", "عنوان التحديث", r.title, "text", "required") +
      select(
        "type",
        "نوع التحديث",
        [
          "التجميعات اليومية",
          "التسريبات المتداولة",
          "اختبار اليوم",
          "الأكثر تكرارًا أسبوعيًا",
          "أحدث الأسئلة",
        ].map((v) => [v, v]),
        r.type,
      ) +
      field("body", "المحتوى", r.body, "textarea", "required") +
      select(
        "testId",
        "اختبار مرتبط بهذا التحديث (اختياري)",
        [
          ["", "بدون اختبار مرتبط"],
          ...(db.tests || []).map((t) => [
            t.id,
            t.title + (t.visible ? "" : " — مخفي"),
          ]),
        ],
        r.testId || "",
      );
  if (type === "tests")
    fields =
      field("title", "عنوان الاختبار", r.title, "text", "required") +
      field(
        "duration",
        "المدة بالثواني",
        r.duration || 180,
        "number",
        'min="30" max="14400" required',
      ) +
      field(
        "points",
        "الدرجات لكل سؤال",
        r.points || 1,
        "number",
        'min="0.5" step="0.5" required',
      ) +
      select(
        "access",
        "الوصول",
        [
          ["free", "مجاني"],
          ["paid", "للمشتركين"],
        ],
        r.access || "paid",
      ) +
      `<div class="field"><label for="test-questions">الأسئلة — اختر أكثر من سؤال</label><select id="test-questions" name="questionIds" multiple size="7" required>${db.questions.map((q) => `<option value="${q.id}" ${r.questionIds?.includes(q.id) ? "selected" : ""}>${e(q.subject)}: ${e(q.text)}</option>`).join("")}</select><small>استخدم Ctrl/Cmd لاختيار أكثر من سؤال، أو اختر باللمس على الجوال.</small></div>` +
      checked("visible", "إظهار الاختبار", r.visible ?? true);
  if (type === "plans")
    fields =
      field("title", "اسم المدة", r.title, "text", "required") +
      field(
        "price",
        "السعر بالريال",
        r.price,
        "number",
        'required min="0.01" max="99999" step="0.01"',
      );
  if (type === "files")
    fields =
      field("title", "اسم الملف", r.title, "text", "required") +
      field("url", "رابط الملف", r.url, "url", "required");
  if (type === "courses")
    fields =
      select(
        "trackId",
        "مسار التعلم / المادة",
        (db.tracks || []).map((t) => [t.id, t.title]),
        r.trackId,
      ) +
      field("groupTitle", "اسم المجموعة الظاهر للطالب (اختياري، مثل زبدة المنصف)", r.groupTitle || "", "text", 'maxlength="80"') +
      select(
        "stage",
        "مرحلة الدورة",
        [
          ["foundation", "التأسيس"],
          ["training", "التدريب"],
          ["review", "المراجعة"],
        ],
        r.stage || "foundation",
      ) +
      select(
        "instructorId",
        "المدرس أو المصدر",
        [
          ["", "دورة مستقلة — دون مصدر محدد"],
          ...instructors
            .filter((t) => !t.deleted || t.id === r.instructorId)
            .map((t) => [t.id, t.name + (t.published ? "" : " — مخفي")]),
        ],
        r.instructorId || "",
      ) +
      fields;
  if (type === "lessons")
    fields =
      field(
        "topicId",
        "معرّف الموضوع (لتجميع المقاطع واختبار الموضوع)",
        r.topicId || "",
      ) +
      field(
        "estimatedMinutes",
        "دقائق تقديرية للقراءة أو مصدر فيديو خارجي (اختياري)",
        r.estimatedMinutes || "",
        "number",
        'min="0.1" step="0.1"',
      ) +
      field(
        "videoDuration",
        "مدة الفيديو المستخرجة بالدقائق",
        r.durationSeconds ? (r.durationSeconds / 60).toFixed(2) : "",
        "number",
        "readonly",
      ) +
      fields +
      `<div class="field"><label>أسئلة تطبيق إضافية اختيارية</label><select name="practiceQuestionIds" multiple size="5">${db.questions.map((q) => `<option value="${q.id}" ${r.practiceQuestionIds?.includes(q.id) ? "selected" : ""}>${e(q.subject)}: ${e(q.text.slice(0, 80))}</option>`).join("")}</select></div>`;
  if (type === "questions")
    fields =
      select(
        "trackId",
        "مسار السؤال",
        (db.tracks || []).map((t) => [t.id, t.title]),
        r.trackId || "",
      ) +
      field(
        "topicId",
        "معرّف الموضوع (vocabulary للمفردات، reading للاستيعاب)",
        r.topicId || "",
      ) +
      fields;
  if (type === "tests")
    fields =
      select(
        "level",
        "مستوى الاختبار",
        [
          ["general", "عام"],
          ["diagnostic", "اكتشاف مستوى"],
          ["lesson", "أسئلة درس قصيرة"],
          ["topic", "اختبار موضوع — ٥ إلى ١٠ أسئلة"],
          ["daily", "يومي"],
          ["weekly", "أسبوعي — الكمي واللفظي معًا للقدرات"],
        ],
        r.level || "general",
      ) +
      select(
        "courseId",
        "دورة مرتبطة (اختياري)",
        [["", "بدون"], ...db.courses.map((c) => [c.id, c.title])],
        r.courseId || "",
      ) +
      field("topicId", "معرّف الموضوع المرتبط", r.topicId || "") +
      `<div class="field"><label>مسارات الاختبار</label><select name="trackIds" multiple size="5">${(db.tracks || []).map((t) => `<option value="${t.id}" ${r.trackIds?.includes(t.id) ? "selected" : ""}>${e(t.title)}</option>`).join("")}</select></div>` +
      fields;
  if (type === "updates")
    fields =
      select(
        "sectionId",
        "القسم المرتبط",
        [["", "عام"], ...db.sections.map((s) => [s.id, s.title])],
        r.sectionId || "",
      ) +
      select(
        "frequency",
        "وتيرة التحديث",
        [
          ["daily", "يومي"],
          ["weekly", "أسبوعي"],
        ],
        r.frequency || "daily",
      ) +
      select(
        "courseId",
        "الدورة المرتبطة (اختياري)",
        [["", "بدون"], ...db.courses.map((c) => [c.id, c.title])],
        r.courseId || "",
      ) +
      field(
        "lessonId",
        "معرّف درس مرتبط داخل الدورة (اختياري)",
        r.lessonId || "",
      ) +
      select(
        "assetId",
        "ملف تعليمي مرتبط (اختياري)",
        [
          ["", "بدون"],
          ...assets
            .filter((a) => a.status === "ready")
            .map((a) => [a.id, a.name]),
        ],
        r.assetId || "",
      ) +
      fields +
      checked(
        "rightsConfirmed",
        "أؤكد أن المواد المنشورة مصرح لي باستخدامها ونشرها",
        r.rightsConfirmed || false,
      ) +
      checked("free", "إتاحة الملف المرتبط مجانًا (إن وجد)", r.free || false) +
      checked("visible", "نشر التحديث", r.visible !== false);
  showDialog(
    row ? "تعديل المحتوى" : "إضافة محتوى",
    `<form id="edit-form" data-type="${type}" data-id="${id || ""}" data-course="${courseId || ""}">${fields}<div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ ${icon("check")}</button><button class="btn btn-outline" type="button" data-close>إلغاء</button></div></form>`,
  );
  if (type === "lessons") {
    const selectVideo = modal.querySelector('[name="videoAssetId"]'),
      duration = modal.querySelector('[name="videoDuration"]');
    const showDuration = () => {
      const value = assets.find(
        (a) => a.id === selectVideo.value,
      )?.duration_seconds;
      duration.value = value ? (value / 60).toFixed(2) : "";
    };
    selectVideo.addEventListener("change", showDuration);
    showDuration();
  }
}
function lessons(courseId) {
  const c = db.courses.find((c) => c.id === courseId);
  if (!c) return;
  showDialog(
    "دروس: " + e(c.title),
    `<div class="stack">${c.lessons.map((l) => `<div class="list-row"><span>${e(l.title)}</span><div class="table-actions"><button class="btn btn-outline btn-sm" data-edit="lessons" data-course="${courseId}" data-id="${l.id}">تعديل</button><button class="btn btn-outline btn-sm danger" data-delete="lessons" data-course="${courseId}" data-id="${l.id}">حذف</button></div></div>`).join("")}<button class="btn btn-primary" data-edit="lessons" data-course="${courseId}">${icon("plus")} إضافة درس</button></div>`,
  );
}
export function mountAdmin(toast, rerender) {
  const refresh = async () => {
    await saveDb();
    modal.close();
    rerender(false);
  };
  const click = async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    const d = b.dataset;
    if (d.adminTab) {
      tab = d.adminTab;
      rerender(false);
    }
    if ("close" in d) modal.close();
    if (d.edit)
      void editForm(d.edit, d.id, d.course).catch((err) => toast(err.message));
    if (d.lessons) lessons(d.lessons);
    if (d.delete) {
      showDialog(
        "حذف المحتوى؟",
        `<p>سيُحذف العنصر من قاعدة بيانات المنصة. حذف القسم يحذف دوراته وأسئلته المرتبطة.</p><div class="modal-actions"><button class="btn btn-primary" id="confirm-delete">تأكيد الحذف</button><button class="btn btn-outline" data-close>إلغاء</button></div>`,
      );
      document.querySelector("#confirm-delete").onclick = async () => {
        if (d.delete === "lessons") {
          const c = db.courses.find((c) => c.id === d.course);
          if (previewLessonId(c) === d.id) c.previewLessonId = null;
          c.lessons = c.lessons.filter((l) => l.id !== d.id);
        } else {
          db[d.delete] = db[d.delete].filter((x) => x.id !== d.id);
          if (d.delete === "sections") {
            db.tracks = (db.tracks || []).filter((t) => t.sectionId !== d.id);
            db.courses = db.courses.filter((c) => c.sectionId !== d.id);
            db.questions = db.questions.filter((q) => q.sectionId !== d.id);
          }
        }
        if (d.delete === "questions" || d.delete === "sections")
          for (const t of db.tests || [])
            t.questionIds = t.questionIds.filter((id) =>
              db.questions.some((q) => q.id === id),
            );
        try {
          await refresh();
          toast("تم حذف المحتوى على الخادم");
        } catch (err) {
          toast(err.message);
        }
      };
    }
    if (d.adminAction === "export") {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(db, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "ruzmah-content.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast("تم تجهيز نسخة المحتوى");
    }
    if (d.adminAction === "reset") {
      showDialog(
        "استعادة المحتوى الأصلي؟",
        `<p>سيُستبدل المحتوى الحالي بنسخة المحتوى الأولية. لا يشمل ذلك تقدم الطالب.</p><div class="modal-actions"><button id="confirm-reset" class="btn btn-primary">استعادة</button><button class="btn btn-outline" data-close>إلغاء</button></div>`,
      );
      document.querySelector("#confirm-reset").onclick = async () => {
        try {
          await resetDb();
        } catch (err) {
          toast(err.message);
          return;
        }
        modal.close();
        rerender(false);
        toast("تمت استعادة المحتوى الأصلي");
      };
    }
  };
  const submit = async (ev) => {
    const form = ev.target;
    if (form.id !== "edit-form" && form.id !== "brand-form") return;
    ev.preventDefault();
    const data = new FormData(form),
      get = (n) => String(data.get(n) || "").trim();
    try {
      if (form.id === "brand-form") {
        Object.assign(db.brand, {
          name: get("name"),
          hero: get("hero"),
          description: get("description"),
          color: get("color"),
          logo: get("logo"),
          logoDark: get("logoDark"),
          heroImage: get("heroImage"),
        });
        await refresh();
        toast("تم تحديث الهوية على الخادم");
        return;
      }
      const type = form.dataset.type,
        id = form.dataset.id || crypto.randomUUID(),
        courseId = form.dataset.course;
      let obj = {
        ...(type === "lessons"
          ? db.courses
              .find((c) => c.id === courseId)
              ?.lessons.find((l) => l.id === id)
          : db[type]?.find((x) => x.id === id)),
        id,
      };
      if (type === "sections")
        Object.assign(obj, {
          title: get("title"),
          label: get("label"),
          description: get("description"),
          subjects: get("subjects")
            .split(/[,،]/)
            .map((s) => s.trim())
            .filter(Boolean),
          order: Number(get("order")),
          icon: get("icon"),
          visible: data.has("visible"),
          status: get("status"),
        });
      if (type === "courses")
        Object.assign(obj, {
          title: get("title"),
          description: get("description"),
          sectionId: get("sectionId"),
          subject: get("subject"),
          status: get("status"),
          art: get("art"),
          access: get("access"),
          thumbnail: get("thumbnail"),
          thumbnailAssetId: get("thumbnailAssetId"),
          visible: data.has("visible"),
          order: Number(get("order")),
          lessons: db.courses.find((c) => c.id === id)?.lessons || [],
        });
      if (type === "lessons")
        Object.assign(obj, {
          title: get("title"),
          body: get("body"),
          example: get("example"),
          free: data.has("free"),
          videoAssetId: get("videoAssetId"),
          order: Number(get("order")),
          visible: data.has("visible"),
          questionId: get("questionId"),
        });
      if (type === "questions")
        Object.assign(obj, {
          text: get("text"),
          sectionId: get("sectionId"),
          subject: get("subject"),
          options: [0, 1, 2, 3].map((i) => get("option" + i)),
          correct: Number(get("correct")),
          explanation: get("explanation"),
          difficulty: "تأسيس",
          access: get("access"),
        });
      if (type === "tests")
        Object.assign(obj, {
          title: get("title"),
          duration: Number(get("duration")),
          points: Number(get("points")),
          questionIds: data.getAll("questionIds"),
          access: get("access"),
          visible: data.has("visible"),
          demo: false,
        });
      if (type === "updates")
        Object.assign(obj, {
          title: get("title"),
          type: get("type"),
          body: get("body"),
          updatedAt: new Date().toISOString(),
          testId: get("testId"),
        });
      if (type === "plans")
        Object.assign(obj, {
          ...db.plans.find((p) => p.id === id),
          title: get("title"),
          price: Number(get("price")),
        });
      if (type === "files")
        Object.assign(obj, { title: get("title"), url: get("url") });
      if (type === "courses")
        Object.assign(obj, {
          trackId: get("trackId"),
          stage: get("stage"),
          groupTitle: get("groupTitle"),
          instructorId: get("instructorId"),
          previewLessonId: get("previewLessonId") || null,
        });
      if (type === "lessons")
        Object.assign(obj, {
          topicId: get("topicId"),
          estimatedMinutes: get("estimatedMinutes")
            ? Number(get("estimatedMinutes"))
            : null,
          practiceQuestionIds: data.getAll("practiceQuestionIds"),
        });
      if (type === "questions")
        Object.assign(obj, {
          trackId: get("trackId"),
          topicId: get("topicId"),
        });
      if (type === "tests")
        Object.assign(obj, {
          level: get("level"),
          trackIds: data.getAll("trackIds"),
          courseId: get("courseId"),
          topicId: get("topicId"),
        });
      if (type === "updates")
        Object.assign(obj, {
          sectionId: get("sectionId"),
          frequency: get("frequency"),
          courseId: get("courseId"),
          lessonId: get("lessonId"),
          assetId: get("assetId"),
          free: data.has("free"),
          rightsConfirmed: data.has("rightsConfirmed"),
          visible: data.has("visible"),
        });
      const priorCourse =
        type === "lessons" ? db.courses.find((c) => c.id === courseId) : null;
      const priorPreview = priorCourse
        ? Object.hasOwn(priorCourse, "previewLessonId")
          ? priorCourse.previewLessonId
          : previewLessonId(priorCourse)
        : null;
      const array =
          type === "lessons"
            ? db.courses.find((c) => c.id === courseId).lessons
            : db[type],
        i = array.findIndex((r) => r.id === id);
      if (i >= 0) array[i] = obj;
      else array.push(obj);
      if (type === "lessons") {
        array.sort((a, b) => (a.order || 0) - (b.order || 0));
        const course = db.courses.find((c) => c.id === courseId);
        if (data.has("free")) course.previewLessonId = obj.id;
        else if (priorPreview === obj.id) course.previewLessonId = null;
      }
      await refresh();
      toast("تم حفظ المحتوى على الخادم");
    } catch (err) {
      toast(err.message || "تعذر الحفظ. تحقق من البيانات والاتصال بالخادم.");
    }
  };
  const change = async (ev) => {
    if (ev.target.name === "trackId" && ev.target.closest("#edit-form")) {
      const t = db.tracks.find((t) => t.id === ev.target.value),
        form = ev.target.form;
      if (t) {
        if (form.elements.sectionId)
          form.elements.sectionId.value = t.sectionId;
        if (form.elements.subject) form.elements.subject.value = t.subject;
      }
    }
    if (ev.target.id !== "import-file") return;
    const file = ev.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024)
        throw Error("اختر ملفًا أصغر من ٢ ميجابايت");
      const value = JSON.parse(await file.text());
      await importDb(value);
      rerender(false);
      toast("تم استيراد المحتوى");
    } catch (err) {
      toast(err.message || "تعذر قراءة الملف");
    }
  };
  const cleanupLive =
    tab === "storefront"
      ? mountStoreAdmin(toast)
      : ["instructors", "learning-tracks", "scheduler"].includes(tab)
        ? mountLearningAdmin(tab, toast, rerender)
        : mountAdminLive(tab, toast, rerender);
  document.addEventListener("click", click);
  document.addEventListener("submit", submit);
  document.addEventListener("change", change);
  return () => {
    cleanupLive();
    document.removeEventListener("click", click);
    document.removeEventListener("submit", submit);
    document.removeEventListener("change", change);
  };
}

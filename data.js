import { api, account, setSession } from "./api.js";
export const defaults = {
  version: 1,
  brand: {
    name: "رُزمة",
    color: "#7460d4",
    hero: "طموحك كبير.\nواستعدادك يبدأ من رُزمة.",
    description:
      "تأسيس، شروحات، تجميعات، واختبارات محاكية. كل ما تحتاجه للقدرات والتحصيلي في مكان واحد، وبطريقتك.",
    logo: "",
    heroImage: "",
  },
  sections: [
    {
      id: "qudrat",
      title: "القدرات العامة",
      label: "فكّر بمرونة. حلّ بثقة.",
      description:
        "من أول مفهوم إلى آخر تدريب. ابنِ أساسًا متينًا في الكمي واللفظي، خطوة بخطوة.",
      subjects: [
        "كمي",
        "لفظي",
        "تأسيس",
        "تدريبات",
        "تجميعات",
        "اختبارات محاكية",
      ],
      icon: "shapes",
      visible: true,
      order: 1,
      status: "demo",
    },
    {
      id: "tahsili",
      title: "التحصيلي",
      label: "اربط المعلومة. واترك أثرًا.",
      description:
        "رتّب معارفك في الرياضيات والفيزياء والكيمياء والأحياء، وحوّل الفهم إلى استعداد.",
      subjects: [
        "رياضيات",
        "فيزياء",
        "كيمياء",
        "أحياء",
        "تأسيس",
        "تدريبات",
        "اختبارات",
      ],
      icon: "atom",
      visible: true,
      order: 2,
      status: "demo",
    },
    {
      id: "step",
      title: "STEP",
      label: "Your next chapter.",
      description:
        "مساحتك القادمة للاستعداد لاختبار كفايات اللغة الإنجليزية. مشمول في اشتراكك عند إطلاقه.",
      subjects: ["قريبًا"],
      icon: "language",
      visible: true,
      order: 3,
      status: "coming",
    },
  ],
  courses: [
    {
      id: "quant-basics",
      sectionId: "qudrat",
      subject: "كمي",
      title: "الأساس الذي تبني عليه",
      description:
        "ابدأ مع النسب والتناسب، وافهم الفكرة قبل أن تحفظ طريقة الحل.",
      art: "math",
      visible: true,
      order: 1,
      status: "نموذج توضيحي",
      access: "paid",
      thumbnail: "",
      lessons: [
        {
          id: "ratios",
          title: "النسب والتناسب — البداية",
          free: true,
          body: "النسبة مقارنة بين كميتين باستخدام القسمة. عندما نقول إن نسبة الأقلام الزرقاء إلى الحمراء ٢ : ٣، فهذا يعني أن كل مجموعة من ٥ أقلام تحتوي على قلمين أزرقين وثلاثة حمراء.",
          example:
            "إذا كان مجموع الأقلام ٢٠ قلمًا، فإن عدد المجموعات = ٢٠ ÷ ٥ = ٤. إذن عدد الأقلام الزرقاء = ٢ × ٤ = ٨ أقلام.",
          questionId: "q1",
        },
      ],
    },
    {
      id: "verbal-basics",
      sectionId: "qudrat",
      subject: "لفظي",
      title: "للكلمة معنى… وللعلاقة مفتاح",
      description: "اكتشف العلاقات بين الكلمات وتدرّب على التناظر اللفظي.",
      art: "letters",
      visible: true,
      order: 2,
      status: "نموذج توضيحي",
      access: "paid",
      thumbnail: "",
      lessons: [
        {
          id: "analogy",
          title: "كيف نفهم التناظر اللفظي؟",
          free: true,
          body: "التناظر اللفظي يعتمد على فهم العلاقة بين كلمتين، ثم اختيار زوج كلمات يحمل العلاقة نفسها. ابدأ بصياغة جملة قصيرة تصف العلاقة.",
          example:
            "قلم : كتابة. القلم أداة للكتابة. إذن نبحث عن أداة ووظيفتها، مثل مفتاح : فتح.",
          questionId: "q2",
        },
      ],
    },
    {
      id: "physics-basics",
      sectionId: "tahsili",
      subject: "فيزياء",
      title: "افهم الحركة من أول خطوة",
      description: "مفاهيم السرعة والمسافة والزمن، بشرح بسيط ومثال واضح.",
      art: "physics",
      visible: true,
      order: 3,
      status: "نموذج توضيحي",
      access: "paid",
      thumbnail: "",
      lessons: [
        {
          id: "speed",
          title: "السرعة المتوسطة",
          free: true,
          body: "السرعة المتوسطة تساوي المسافة الكلية مقسومة على الزمن الكلي. انتبه لوحدات القياس قبل التعويض، ويجب أن يكون الزمن والمسافة بوحدات متوافقة.",
          example:
            "قطعت سيارة ١٢٠ كيلومترًا في ساعتين. السرعة المتوسطة = ١٢٠ ÷ ٢ = ٦٠ كيلومترًا في الساعة.",
          questionId: "q3",
        },
      ],
    },
  ],
  questions: [
    {
      id: "q1",
      sectionId: "qudrat",
      subject: "كمي",
      difficulty: "تأسيس",
      text: "نسبة الأقلام الزرقاء إلى الحمراء ٢ : ٣. إذا كان مجموعها ٢٠، فكم عدد الأقلام الزرقاء؟",
      options: ["٤ أقلام", "٨ أقلام", "١٢ قلمًا", "١٦ قلمًا"],
      correct: 1,
      explanation:
        "مجموع أجزاء النسبة ٥. قيمة الجزء = ٢٠ ÷ ٥ = ٤. عدد الأقلام الزرقاء = ٢ × ٤ = ٨.",
    },
    {
      id: "q2",
      sectionId: "qudrat",
      subject: "لفظي",
      difficulty: "تأسيس",
      text: "اختر العلاقة المشابهة: قلم : كتابة",
      options: ["كتاب : مكتبة", "مفتاح : فتح", "ليل : نهار", "ماء : بحر"],
      correct: 1,
      explanation: "العلاقة أداة ووظيفتها؛ القلم للكتابة والمفتاح للفتح.",
    },
    {
      id: "q3",
      sectionId: "tahsili",
      subject: "فيزياء",
      difficulty: "تأسيس",
      text: "سيارة قطعت ١٢٠ كم في ساعتين. ما سرعتها المتوسطة؟",
      options: ["٣٠ كم/س", "٦٠ كم/س", "١٢٠ كم/س", "٢٤٠ كم/س"],
      correct: 1,
      explanation: "السرعة المتوسطة = المسافة ÷ الزمن = ١٢٠ ÷ ٢ = ٦٠ كم/س.",
    },
  ],
  plans: [
    { id: "month", title: "شهر", months: 1, price: 19.99 },
    { id: "quarter", title: "٣ أشهر", months: 3, price: 39.99 },
    { id: "half", title: "٦ أشهر", months: 6, price: 59.99 },
    { id: "year", title: "سنة كاملة", months: 12, price: 99.99 },
  ],
  updates: [],
  files: [],
  videoAssets: [],
  students: [],
  subscriptions: [],
};
export const allFeatures = [
  "القدرات العامة والتحصيلي",
  "STEP عند إطلاقه",
  "الشروحات والدورات",
  "التجميعات والتحديثات",
  "بنك الأسئلة والاختبارات",
  "دفتر الأخطاء وخطة المذاكرة",
  "ورقة المسودة ومتابعة التقدم",
  "المدرس الذكي وفق حدود الاستخدام",
];
const DATA_KEY = "ruzmah-content-v1",
  USER_KEY = "ruzmah-student-v1";
export function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}
export let db = structuredClone(defaults);
const emptyStudent = {
  name: "",
  completed: [],
  tasks: [],
  attempts: [],
  mistakes: [],
  answers: {},
  feedback: {},
  lastLesson: null,
  selectedPlan: null,
};
export let student = structuredClone(emptyStudent);
export async function initialize() {
  const [content, session] = await Promise.all([
    api("/api/content"),
    api("/api/session"),
  ]);
  db = content;
  setSession(session);
  student = { ...structuredClone(emptyStudent), ...(session.student || {}) };
  return session;
}
export async function reloadContent() {
  db = await api(
    account.user?.role === "admin" ? "/api/admin/content" : "/api/content",
  );
  return db;
}
export function setStudent(value) {
  student = { ...structuredClone(emptyStudent), ...value };
}
export async function saveDb() {
  db = await api("/api/admin/content", { method: "PUT", body: db });
}
export async function resetDb() {
  const revision = db.revision;
  db = { ...structuredClone(defaults), tests: db.tests || [], revision };
  await saveDb();
}

export function validateDb(value) {
  const fail = () => {
    throw Error("صيغة ملف المحتوى غير متوافقة");
  };
  if (
    !value ||
    value.version !== 1 ||
    !value.brand ||
    !["sections", "courses", "questions", "plans", "updates", "files"].every(
      (k) => Array.isArray(value[k]),
    )
  )
    fail();
  const str = (v, max = 10000) => typeof v === "string" && v.length <= max;
  for (const k of ["name", "hero", "description", "color"])
    if (!str(value.brand[k])) fail();
  if (!/^#[0-9a-f]{6}$/i.test(value.brand.color)) fail();
  for (const k of [
    "sections",
    "courses",
    "questions",
    "plans",
    "updates",
    "files",
  ]) {
    const ids = new Set();
    for (const row of value[k]) {
      if (
        !row ||
        !str(row.id, 100) ||
        !/^[a-zA-Z0-9_-]+$/.test(row.id) ||
        ids.has(row.id)
      )
        fail();
      ids.add(row.id);
    }
  }
  for (const row of value.sections) {
    if (
      !str(row.title) ||
      !str(row.description) ||
      !str(row.label) ||
      !Array.isArray(row.subjects) ||
      !row.subjects.every((x) => str(x, 100)) ||
      !Number.isFinite(row.order) ||
      typeof row.visible !== "boolean"
    )
      fail();
  }
  for (const row of value.courses) {
    if (
      !str(row.title) ||
      !str(row.description) ||
      !str(row.subject) ||
      !str(row.status) ||
      !Number.isFinite(row.order) ||
      typeof row.visible !== "boolean" ||
      !value.sections.some((s) => s.id === row.sectionId) ||
      !Array.isArray(row.lessons)
    )
      fail();
    const ids = new Set();
    for (const l of row.lessons) {
      if (
        !str(l.id, 100) ||
        !/^[a-zA-Z0-9_-]+$/.test(l.id) ||
        ids.has(l.id) ||
        !str(l.title) ||
        !str(l.body) ||
        typeof l.free !== "boolean"
      )
        fail();
      ids.add(l.id);
    }
  }
  for (const q of value.questions)
    if (
      !str(q.text) ||
      !str(q.subject) ||
      !str(q.explanation) ||
      !Array.isArray(q.options) ||
      q.options.length !== 4 ||
      !q.options.every((x) => str(x, 1000)) ||
      !Number.isInteger(q.correct) ||
      q.correct < 0 ||
      q.correct > 3 ||
      !value.sections.some((s) => s.id === q.sectionId)
    )
      fail();
  for (const p of value.plans)
    if (
      !str(p.title) ||
      !Number.isFinite(p.price) ||
      p.price <= 0 ||
      !Number.isInteger(p.months) ||
      p.months <= 0
    )
      fail();
  if (!value.plans.some((p) => p.months === 1)) fail();
  for (const u of value.updates)
    if (
      !str(u.title) ||
      !str(u.body) ||
      !str(u.type) ||
      !Number.isFinite(Date.parse(u.updatedAt))
    )
      fail();
  for (const f of value.files) if (!str(f.title) || !str(f.url)) fail();
  return value;
}
export async function importDb(value) {
  validateDb(value);
  const revision = db.revision;
  db = { ...value, tests: value.tests || db.tests || [], revision };
  await saveDb();
}
let saveQueue = Promise.resolve();
export async function saveStudent() {
  if (!account.user) throw Error("سجل الدخول لحفظ تقدمك");
  const body = structuredClone({
    tasks: student.tasks,
    completed: student.completed,
    lastLesson: student.lastLesson,
    selectedPlan: student.selectedPlan,
  });
  saveQueue = saveQueue
    .catch(() => {})
    .then(() => api("/api/student/state", { method: "PUT", body }));
  await saveQueue;
}
export const visibleSections = () =>
  db.sections.filter((s) => s.visible).sort((a, b) => a.order - b.order);
export const visibleCourses = () =>
  db.courses
    .filter(
      (c) =>
        c.visible && db.sections.find((s) => s.id === c.sectionId)?.visible,
    )
    .sort((a, b) => a.order - b.order);
export const visibleQuestions = () =>
  db.questions.filter((q) =>
    db.sections.some(
      (s) => s.id === q.sectionId && s.visible && s.status !== "coming",
    ),
  );
export const sectionName = (id) =>
  db.sections.find((s) => s.id === id)?.title || id;
export const money = (n) => Number(n).toFixed(2);
export const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const safeUrl = (url) =>
  /^(https?:\/\/|assets\/|data:image\/(png|jpeg|webp|svg\+xml);)/i.test(
    url || "",
  )
    ? escape(url)
    : "";

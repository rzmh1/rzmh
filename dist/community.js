import { api } from "./api.js";
import { escape as e } from "./data.js";
import { icon, notice, empty } from "./ui.js";

const statusLabels = {
  pending: "بانتظار مراجعة الإدارة",
  replied: "تم الرد",
  rejected: "مرفوض",
  closed: "مغلق",
};
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
};

export function communityPage() {
  return '<section class="support-page"><div class="page-heading"><span class="eyebrow">تواصل مباشر مع الإدارة</span><h1>اسأل رُزمة</h1><p>أرسل استفسارك وسيصل إلى إدارة رُزمة فقط. لن يظهر للطلاب الآخرين إلا إذا راجعت الإدارة السؤال وأجابت عنه ووافقت على نشره.</p></div><div id="support-root"><div class="dash-skeleton"><span></span><span></span><span></span></div></div></section>';
}

export function mountCommunity(toast) {
  const root = document.querySelector("#support-root");
  if (!root) return () => {};
  let disposed = false;
  let categories = [];
  let mine = [];
  let published = [];
  let selectedCategory = "all";

  const fail = (err) => {
    if (!disposed) toast(err.message || "تعذر تنفيذ العملية.");
  };
  const statusBadge = (status) =>
    '<span class="badge ' + (status === "replied" ? "badge-purple" : "") + '">' +
    e(statusLabels[status] || status) +
    "</span>";

  function render() {
    const categoryOptions = categories.map((c) =>
      '<option value="' + e(c.id) + '">' + e(c.name) + "</option>"
    ).join("");
    const mineCards = mine.map((q) =>
      '<article class="panel support-ticket"><div class="support-ticket-top"><div><span class="badge">' +
      e(q.category_name) +
      '</span><time>' +
      dateLabel(q.created_at) +
      '</time></div>' +
      statusBadge(q.status) +
      '</div><h3>' +
      e(q.subject) +
      '</h3><p>' +
      e(q.body) +
      '</p>' +
      (q.reply ? '<div class="support-reply"><b>' + icon("message-circle") + " رد إدارة رُزمة</b><p>" + e(q.reply) + "</p>" +
        (q.published ? '<small class="support-published">' + icon("globe") + " نُشر الرد ليستفيد منه الطلاب" + "</small>" : '<small class="muted">هذا الرد خاص بك فقط</small>') +
        "</div>" : '<small class="muted">سيظهر رد الإدارة هنا بعد مراجعة استفسارك.</small>') +
      "</article>"
    ).join("");
    const publicCards = published.map((q) =>
      '<article class="panel support-public-card"><div class="support-ticket-top"><span class="badge">' +
      e(q.category_name) +
      '</span><time>' +
      dateLabel(q.replied_at) +
      '</time></div><h3>' +
      e(q.subject) +
      '</h3><p>' +
      e(q.body) +
      '</p><div class="support-reply"><b>' +
      icon("check-circle") +
      " رد إدارة رُزمة</b><p>" +
      e(q.reply) +
      "</p></div></article>"
    ).join("");
    root.innerHTML =
      '<div class="support-grid"><section class="panel support-compose"><span class="eyebrow">استفسار جديد</span><h2>كيف نقدر نساعدك؟</h2>' +
      notice("استفسارك خاص ولا يراه غيرك وإدارة رُزمة. الإدارة وحدها تقرر إن كان السؤال والرد مناسبين للنشر ليستفيد منه بقية الطلاب.") +
      '<form id="support-question-form" class="spaced"><div class="field"><label for="support-category">نوع الاستفسار</label><select id="support-category" name="categoryId" required>' +
      categoryOptions +
      '</select></div><div class="field"><label for="support-subject">عنوان الاستفسار</label><input id="support-subject" name="subject" maxlength="120" minlength="4" placeholder="مثال: متى تنزل تحديثات التسريبات؟" required></div><div class="field"><label for="support-body">التفاصيل</label><textarea id="support-body" name="body" rows="5" maxlength="1800" minlength="10" placeholder="اكتب سؤالك أو وضّح المشكلة..." required></textarea></div><button class="btn btn-primary" type="submit">إرسال إلى الإدارة ' +
      icon("send") +
      '</button></form></section><section class="support-info"><div class="panel"><h2>كيف تتم الإجابة؟</h2><ol class="support-steps"><li>ترسل سؤالك بسرية.</li><li>تراجعه إدارة رُزمة.</li><li>تكتب الإدارة الرد المناسب.</li><li>تقرر الإدارة إبقاءه خاصًا أو نشره للجميع.</li></ol></div><div class="panel"><h2>أسئلتي</h2><p class="muted">تظهر هنا استفساراتك وحالة كل استفسار ورد الإدارة.</p>' +
      (mineCards || empty("لم ترسل استفسارات بعد", "إذا احتجت مساعدة، أرسل سؤالك من النموذج.", "message-circle")) +
      '</div></section></div><section class="support-public-section"><div class="section-heading"><div><h2>إجابات منشورة من رُزمة</h2><p>هذه فقط الاستفسارات التي وافقت الإدارة على نشرها بعد الرد عليها.</p></div><label class="support-filter"><span class="sr-only">تصفية حسب التصنيف</span><select id="support-public-filter"><option value="all">كل التصنيفات</option>' +
      categoryOptions +
      '</select></label></div>' +
      (publicCards || empty("لا توجد إجابات منشورة بعد", "ستظهر هنا الإجابات التي تعتمد الإدارة نشرها ليستفيد منها الجميع.", "message-circle")) +
      "</section>";
    const filter = root.querySelector("#support-public-filter");
    if (filter) filter.value = selectedCategory;
  }

  async function load() {
    try {
      const [categoryData, ownData, publicData] = await Promise.all([
        api("/api/support/categories"),
        api("/api/support/questions"),
        api("/api/support/public?category=" + encodeURIComponent(selectedCategory)),
      ]);
      if (disposed) return;
      categories = categoryData;
      mine = ownData;
      published = publicData;
      render();
    } catch (err) {
      if (!disposed) root.innerHTML = empty("تعذر تحميل اسأل رُزمة", e(err.message), "error");
    }
  }

  async function submit(ev) {
    if (ev.target.id !== "support-question-form") return;
    ev.preventDefault();
    const form = ev.target;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      await api("/api/support/questions", { method: "POST", body: values });
      toast("وصل استفسارك إلى إدارة رُزمة. ستجد الرد هنا بعد المراجعة.");
      await load();
    } catch (err) {
      fail(err);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function change(ev) {
    if (ev.target.id !== "support-public-filter") return;
    selectedCategory = ev.target.value;
    try {
      published = await api("/api/support/public?category=" + encodeURIComponent(selectedCategory));
      if (!disposed) render();
    } catch (err) {
      fail(err);
    }
  }

  root.addEventListener("submit", submit);
  root.addEventListener("change", change);
  void load();
  return () => {
    disposed = true;
    root.removeEventListener("submit", submit);
    root.removeEventListener("change", change);
  };
}

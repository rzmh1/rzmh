import { api, account } from "./api.js";
import { escape as e } from "./data.js";
import { icon, empty, notice } from "./ui.js";

const trackLabels = {
  qudrat: "القدرات",
  tahsili: "التحصيلي",
  step: "STEP",
};
const subjectLabels = {
  quantitative: "كمي",
  verbal: "لفظي",
  math: "رياضيات",
  physics: "فيزياء",
  chemistry: "كيمياء",
  biology: "أحياء",
  english: "إنجليزي",
  other: "عام",
};
const dateLabel = (value) =>
  value
    ? new Date(value).toLocaleDateString("ar-SA", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "تاريخ غير محدد";

export function leaksPage() {
  return `<section class="leaks-page">
    <div class="page-heading">
      <span class="eyebrow">تجارب المختبرين</span>
      <h1>التسريبات</h1>
      <p>إفادات وتجارب طلابية غير رسمية عن الموضوعات التي يتذكرها المختبرون. لا تمثل أسئلة رسمية ولا تضمن تكرارها.</p>
    </div>
    <div id="leaks-root" aria-live="polite">
      <div class="dash-skeleton"><span></span><span></span><span></span></div>
    </div>
  </section>`;
}

export function mountLeaks(toast) {
  const target = document.querySelector("#leaks-root");
  if (!target) return () => {};
  let disposed = false,
    items = [],
    filterTrack = "all",
    filterSubject = "all",
    compose = false;

  function error(err) {
    if (!disposed) toast(err.message);
  }

  function render() {
    const visible = items.filter(
      (item) =>
        (filterTrack === "all" || item.track === filterTrack) &&
        (filterSubject === "all" || item.subject === filterSubject),
    );
    target.innerHTML = `
      ${notice("المشاركات غير رسمية وقد تكون غير دقيقة. لا ننشر نصوصًا حرفية أو صورًا لأسئلة سرية أو محمية؛ تُراجع كل إفادة قبل ظهورها.", "info")}
      <div class="leaks-toolbar">
        <div class="leaks-filters">
          <label>المسار
            <select id="leaks-track-filter">
              <option value="all" ${filterTrack === "all" ? "selected" : ""}>كل المسارات</option>
              ${Object.entries(trackLabels).map(([id, label]) => `<option value="${id}" ${filterTrack === id ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label>التصنيف
            <select id="leaks-subject-filter">
              <option value="all" ${filterSubject === "all" ? "selected" : ""}>كل التصنيفات</option>
              ${Object.entries(subjectLabels).map(([id, label]) => `<option value="${id}" ${filterSubject === id ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
        </div>
        <button class="btn btn-primary" type="button" data-leak-compose>
          ${icon("plus")} ${compose ? "إغلاق النموذج" : "أرسل تجربتك"}
        </button>
      </div>
      ${compose ? `
        <form id="leak-form" class="panel leaks-form spaced">
          <div class="panel-head"><div><span class="eyebrow">مشاركة آمنة</span><h2>ما الموضوع الذي تتذكره؟</h2></div><span class="badge">تظهر بعد المراجعة</span></div>
          <p class="muted">صف المهارة أو الفكرة من ذاكرتك بأسلوبك. لا تنسخ نص السؤال أو خياراته ولا ترفق صورًا من الاختبار.</p>
          <div class="form-grid">
            <div class="field"><label for="leak-track">المسار</label><select id="leak-track" name="track" required><option value="qudrat">القدرات</option><option value="tahsili">التحصيلي</option><option value="step">STEP</option></select></div>
            <div class="field"><label for="leak-subject">التصنيف</label><select id="leak-subject" name="subject" required><option value="quantitative">كمي</option><option value="verbal">لفظي</option><option value="math">رياضيات</option><option value="physics">فيزياء</option><option value="chemistry">كيمياء</option><option value="biology">أحياء</option><option value="english">إنجليزي</option><option value="other">عام</option></select></div>
            <div class="field"><label for="leak-date">تاريخ الاختبار (اختياري)</label><input id="leak-date" name="examDate" type="date"></div>
            <div class="field"><label for="leak-topic">الموضوع أو المهارة</label><input id="leak-topic" name="topic" maxlength="100" minlength="2" placeholder="مثال: التناسب العكسي" required></div>
            <div class="field full"><label for="leak-description">وصف ما تتذكره</label><textarea id="leak-description" name="description" maxlength="1200" minlength="25" rows="4" placeholder="اكتب وصفًا للفكرة أو نوع المهارة من ذاكرتك، دون نقل السؤال حرفيًا..." required></textarea></div>
          </div>
          <label class="checkbox leaks-rights"><input type="checkbox" name="rightsConfirmed" required><span>أؤكد أن المشاركة وصف من ذاكرتي ولا تتضمن نصًا أو صورة سرية أو محمية أو بيانات شخصية.</span></label>
          <div class="modal-actions"><button class="btn btn-primary" type="submit">إرسال للمراجعة ${icon("arrow")}</button><button class="btn btn-outline" type="button" data-leak-compose>إلغاء</button></div>
          <p class="smalltext">يُراجع المحتوى قبل النشر، وقد يُرفض أو يُطلب تعديله. لن يظهر اسمك للطلاب.</p>
        </form>` : ""}
      <div class="leaks-list">
        <div class="section-heading"><div><h2>أحدث الإفادات المعتمدة</h2><p>مرتبة حسب وقت اعتمادها</p></div><span class="badge badge-purple">${visible.length} إفادة</span></div>
        ${visible.length ? visible.map((item) => `
          <article class="leak-card panel">
            <div class="leak-card-top">
              <span class="badge badge-purple">إفادة طالب غير مؤكدة</span>
              <time datetime="${e(item.created_at)}">${dateLabel(item.created_at)}</time>
            </div>
            <h3>${e(item.topic)}</h3>
            <p>${e(item.description)}</p>
            <div class="leak-meta">
              <span>${e(trackLabels[item.track] || item.track)}</span>
              <span>${e(subjectLabels[item.subject] || item.subject)}</span>
              <span>تاريخ التجربة: ${dateLabel(item.exam_date)}</span>
              ${item.similarCount > 1 ? `<span>${item.similarCount} إفادات بالموضوع نفسه</span>` : ""}
            </div>
            <div class="leak-card-foot">
              <span class="smalltext">محتوى راجعه فريق رُزمة · ليس سؤالًا رسميًا</span>
              <button class="btn btn-ghost btn-sm" type="button" data-leak-flag="${e(item.id)}">${icon("flag")} إبلاغ عن محتوى</button>
            </div>
          </article>`).join("") : empty("لا توجد إفادات منشورة بهذا التصنيف", "تظهر المشاركات هنا بعد مراجعتها واعتماد صياغتها العامة.", "file")}
      </div>`;
  }

  async function load() {
    try {
      const result = await api("/api/leaks");
      if (disposed) return;
      items = Array.isArray(result.items) ? result.items : [];
      render();
    } catch (err) {
      if (disposed) return;
      target.innerHTML = empty(
        "تعذر تحميل الإفادات",
        e(err.message),
        "error",
      );
      error(err);
    }
  }

  async function click(ev) {
    const button = ev.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-leak-compose")) {
      compose = !compose;
      render();
      return;
    }
    const id = button.dataset.leakFlag;
    if (id) {
      const reason = window.prompt(
        "سبب الإبلاغ: inaccurate أو privacy أو copyright أو other",
        "inaccurate",
      );
      if (!reason) return;
      const normalized = reason.trim().toLowerCase();
      if (!["inaccurate", "privacy", "copyright", "other"].includes(normalized)) {
        toast("اكتب أحد الأسباب المحددة بالإنجليزية كما هو ظاهر.");
        return;
      }
      button.disabled = true;
      try {
        await api("/api/leaks/" + encodeURIComponent(id) + "/report", {
          method: "POST",
          body: { reason: normalized },
        });
        toast("وصل بلاغك إلى إدارة رُزمة.");
      } catch (err) {
        button.disabled = false;
        error(err);
      }
    }
  }

  async function submit(ev) {
    if (ev.target.id !== "leak-form") return;
    ev.preventDefault();
    const form = ev.target,
      button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      const result = await api("/api/leaks", {
        method: "POST",
        body: {
          track: values.track,
          subject: values.subject,
          topic: values.topic,
          description: values.description,
          examDate: values.examDate || "",
          rightsConfirmed: form.elements.rightsConfirmed.checked,
        },
      });
      compose = false;
      render();
      toast("وصلت إفادتك للمراجعة. لن تظهر للطلاب قبل اعتمادها.");
    } catch (err) {
      button.disabled = false;
      error(err);
    }
  }

  function change(ev) {
    if (ev.target.id === "leaks-track-filter") {
      filterTrack = ev.target.value;
      render();
    }
    if (ev.target.id === "leaks-subject-filter") {
      filterSubject = ev.target.value;
      render();
    }
  }

  target.addEventListener("click", click);
  target.addEventListener("submit", submit);
  target.addEventListener("change", change);
  void load();
  return () => {
    disposed = true;
    target.removeEventListener("click", click);
    target.removeEventListener("submit", submit);
    target.removeEventListener("change", change);
  };
}

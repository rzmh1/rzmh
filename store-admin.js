import { db, reloadContent, saveDb, escape as e } from "./data.js";
import { storeConfig } from "./store-config.js";
import { icon, notice } from "./ui.js";
export function mountStoreAdmin(toast) {
  const root = document.querySelector("#live-admin-root");
  if (!root) return () => {};
  let disposed = false;
  const field = (name, label, value, type = "text") =>
    `<div class="field"><label>${label}${type === "textarea" ? `<textarea name="${name}">${e(value)}</textarea>` : `<input name="${name}" type="${type}" value="${e(value)}">`}</label></div>`;
  const faqRow = (q = "", a = "") =>
    `<div class="store-admin-faq-row">${field("faqQuestion", "السؤال", q)}${field("faqAnswer", "الإجابة", a, "textarea")}<button class="btn btn-outline btn-sm" type="button" data-remove-store-faq>حذف السؤال</button></div>`;
  async function load() {
    try {
      await reloadContent();
      if (disposed) return;
      const v = storeConfig(db);
      root.innerHTML = `<div class="admin-bar"><h2>إدارة واجهة المتجر</h2><a class="btn btn-outline btn-sm" href="#/">عرض المتجر ${icon("arrow")}</a></div>${notice("هذه إعدادات المحتوى العادية. أكواد HTML/CSS/JavaScript لها قسم مستقل ومعاينة ونشر معزولان. لتعديل العنوان الافتتاحي والشعار والصورة استخدم «الهوية والرئيسية».")}<form id="store-content-form"><section class="panel"><h3>العناوين والظهور وترتيب الأقسام</h3><p>الواجهة الترحيبية ثابتة أولًا. ترتيب بقية أقسام المتجر من الأرقام أدناه.</p><div class="stack spaced">${v.sections.map((s) => `<details class="store-admin-section"><summary>${e(s.label)} ${icon("down")}</summary><div class="form-grid">${field(s.id + "-title", "العنوان", s.title, "textarea")}${field(s.id + "-eyebrow", "العبارة التمهيدية", s.eyebrow)}${field(s.id + "-description", "الوصف", s.description, "textarea")}${field(s.id + "-order", "الترتيب", s.order, "number")}<label class="checkbox"><input type="checkbox" name="${s.id}-visible" ${s.visible ? "checked" : ""}><span>إظهار القسم</span></label></div></details>`).join("")}</div></section><section class="panel spaced"><h3>بطاقتا التأسيس والتدريب</h3><div class="form-grid">${field("foundation", "وصف التأسيس", v.foundation, "textarea")}${field("training", "وصف التدريب", v.training, "textarea")}</div></section><section class="panel spaced"><h3>البطاقات المختارة للرئيسية</h3><p>اترك الاختيارات فارغة لعرض المحتوى المنشور تلقائيًا. عرض الرئيسية مختصر؛ جميع العناصر متاحة في الكتالوج.</p><div class="grid-two"><fieldset><legend>الدورات</legend>${db.courses.map((c) => `<label class="checkbox"><input type="checkbox" name="featuredCourseIds" value="${c.id}" ${v.featuredCourseIds.includes(c.id) ? "checked" : ""}><span>${e(c.title)}${c.visible ? "" : " — مخفية"}</span></label>`).join("")}</fieldset><fieldset><legend>المدرسون والمصادر</legend>${(db.instructors || []).map((t) => `<label class="checkbox"><input type="checkbox" name="featuredInstructorIds" value="${t.id}" ${v.featuredInstructorIds.includes(t.id) ? "checked" : ""}><span>${e(t.name)}</span></label>`).join("") || "<p>أضف المصادر من قسم المدرسين أولًا.</p>"}</fieldset></div></section><section class="panel spaced"><h3>الأسئلة الشائعة</h3><div id="store-admin-faq">${v.faq.map(([q, a]) => faqRow(q, a)).join("")}</div><button type="button" class="btn btn-outline spaced" data-add-store-faq>إضافة سؤال ${icon("plus")}</button></section><section class="panel spaced"><h3>البريد الرسمي للتواصل</h3>${field("supportEmail", "بريد التواصل (يظهر في التذييل عند إدخاله)", v.supportEmail, "email")}</section><div id="store-save-error" class="form-error" role="alert"></div><button class="btn btn-primary spaced" type="submit">حفظ ونشر محتوى المتجر ${icon("check")}</button></form>`;
    } catch (err) {
      if (!disposed) root.textContent = err.message;
    }
  }
  const click = (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    if (b.hasAttribute("data-add-store-faq")) {
      if (root.querySelectorAll(".store-admin-faq-row").length >= 12) {
        toast("الحد الأقصى ١٢ سؤالًا.");
        return;
      }
      root
        .querySelector("#store-admin-faq")
        .insertAdjacentHTML("beforeend", faqRow());
    }
    if (b.hasAttribute("data-remove-store-faq"))
      b.closest(".store-admin-faq-row").remove();
  };
  const submit = async (ev) => {
    if (ev.target.id !== "store-content-form") return;
    ev.preventDefault();
    const f = ev.target,
      b = f.querySelector("button[type=submit]");
    b.disabled = true;
    try {
      const fd = new FormData(f),
        old = storeConfig(db);
      db.storefront = {
        sections: old.sections.map((s) => ({
          ...s,
          title: fd.get(s.id + "-title"),
          eyebrow: fd.get(s.id + "-eyebrow"),
          description: fd.get(s.id + "-description"),
          order: Number(fd.get(s.id + "-order")),
          visible: fd.has(s.id + "-visible"),
        })),
        foundation: fd.get("foundation"),
        training: fd.get("training"),
        featuredCourseIds: fd.getAll("featuredCourseIds"),
        featuredInstructorIds: fd.getAll("featuredInstructorIds"),
        supportEmail: fd.get("supportEmail").trim(),
        faq: fd
          .getAll("faqQuestion")
          .map((q, i) => [q, fd.getAll("faqAnswer")[i]]),
      };
      await saveDb();
      toast("حُفظ محتوى المتجر ونُشر لجميع الزوار.");
    } catch (err) {
      root.querySelector("#store-save-error").textContent = err.message;
      toast(err.message);
    } finally {
      b.disabled = false;
    }
  };
  document.addEventListener("click", click);
  document.addEventListener("submit", submit);
  void load();
  return () => {
    disposed = true;
    document.removeEventListener("click", click);
    document.removeEventListener("submit", submit);
  };
}

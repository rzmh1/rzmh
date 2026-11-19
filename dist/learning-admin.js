import { api } from "./api.js";
import { db, saveDb, reloadContent, escape as e } from "./data.js";
import { icon, notice, empty } from "./ui.js";
const field = (n, t, v = "", type = "text", extra = "") =>
  `<div class="field"><label for="la-${n}">${t}</label><input name="${n}" id="la-${n}" type="${type}" value="${e(v ?? "")}" ${extra}></div>`;
const select = (n, t, list, v) =>
  `<div class="field"><label for="la-${n}">${t}</label><select id="la-${n}" name="${n}">${list.map(([id, label]) => `<option value="${e(id)}" ${v === id ? "selected" : ""}>${e(label)}</option>`).join("")}</select></div>`;
const table = (heads, rows) =>
  `<div class="admin-table-wrap"><table><thead><tr>${heads.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}">لا توجد بيانات بعد.</td></tr>`}</tbody></table></div>`;
export function mountLearningAdmin(tab, toast, rerender) {
  const target = document.querySelector("#live-admin-root"),
    modal = document.querySelector("#modal");
  if (!target || !["instructors", "learning-tracks", "scheduler"].includes(tab))
    return () => {};
  let disposed = false,
    instructors = [];
  function dialog(title, body) {
    modal.innerHTML = `<div class="modal-head"><h2>${title}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon("close")}</button></div>${body}`;
    if (!modal.open) modal.showModal();
  }
  async function load() {
    try {
      if (tab === "instructors") {
        instructors = await api("/api/admin/learning/instructors");
        if (disposed) return;
        target.innerHTML = `<div class="admin-bar"><h2>المدرسون والمصادر</h2><button class="btn btn-primary btn-sm" data-instructor-edit>إضافة مصدر ${icon("plus")}</button></div>${notice("لا يوجد مدرس ثابت للقسم. اربط كل دورة بمصدرها ومرحلتها؛ يختار الطالب مصادر مختلفة للمراحل. الأرشفة تخفي المصدر وتحافظ على الدورات والتقدم.")} ${table(
          ["المصدر", "التخصص", "النشر", "الدورات والمقاطع", "الإجراءات"],
          instructors.map(
            (t) =>
              `<tr><td>${e(t.name)}<br><small>${t.kind === "source" ? "مصدر" : "مدرّس"}</small></td><td>${e(t.specialty)}</td><td>${t.deleted ? "مؤرشف" : t.published ? "منشور" : "مخفي"}</td><td>${t.courseIds.length} دورات · ${t.videoCount} مقاطع${t.videoSeconds ? " · " + Math.ceil(t.videoSeconds / 60) + " دقيقة معلومة" : ""}</td><td><button class="btn btn-outline btn-sm" data-instructor-edit="${t.id}">تعديل</button> ${!t.deleted ? `<button class="btn btn-outline btn-sm danger" data-instructor-delete="${t.id}">أرشفة وحذف من العرض</button>` : ""}</td></tr>`,
          ),
        )}`;
      }
      if (tab === "learning-tracks") {
        await reloadContent();
        if (disposed) return;
        target.innerHTML = `<div class="admin-bar"><h2>مسارات التعلم والمواد</h2><button class="btn btn-primary btn-sm" data-track-edit>إضافة مسار ${icon("plus")}</button></div>${table(
          ["المسار", "القسم", "المادة", "الترتيب", "الحالة", ""],
          (db.tracks || []).map(
            (t) =>
              `<tr><td>${e(t.title)}</td><td>${e(db.sections.find((s) => s.id === t.sectionId)?.title || "")}</td><td>${e(t.subject)}</td><td>${t.order}</td><td>${t.visible ? "ظاهر" : "مخفي"}${t.coming ? " — قادم" : ""}</td><td><button class="btn btn-outline btn-sm" data-track-edit="${t.id}">تعديل</button> <button class="btn btn-outline btn-sm danger" data-track-delete="${t.id}">حذف</button></td></tr>`,
          ),
        )}<p class="muted spaced">لكل مسار تأسيس وتدريب ومراجعة. تُربط الدورات بالمرحلة من محرر الدورة. لا يُحذف مسار مرتبط بدورات؛ أخفه أو انقل دوراته أولًا.</p>`;
      }
      if (tab === "scheduler") {
        const r = await api("/api/admin/learning/rules");
        if (disposed) return;
        const labels = {
          questionSeconds: "ثوانٍ تقديرية لحل سؤال",
          offlinePracticeMinutes: "دقائق التدريب الذاتي عند غياب أسئلة مرتبطة",
          reviewMinutes: "أقصى دقائق مراجعة الأخطاء",
          breakEveryMinutes: "استراحة بعد كتلة مذاكرة بالدقائق",
          breakMinutes: "دقائق الاستراحة",
          maxWatchBlockMinutes: "أقصى جزء مشاهدة متصل بالدقائق",
          finalReviewMinutes: "دقائق المراجعة العامة قبل الاختبار",
          planningDays: "أيام الخطة المرحلية عند عدم تحديد الموعد",
        };
        target.innerHTML = `<h2>قواعد الجدولة</h2>${notice("مدد الفيديو تُقاس من الملفات. هذه تقديرات الحل والمراجعة والراحة فقط، وليست مددًا افتراضية للمقاطع. يُعاد توزيع المتبقي دون تجاوز الوقت اليومي.")}<form id="scheduler-rules" class="panel"><div class="form-grid">${Object.entries(
          labels,
        )
          .map(([key, label]) =>
            field(key, label, r[key], "number", 'min="1" required'),
          )
          .join(
            "",
          )}</div><button class="btn btn-primary" type="submit">حفظ القواعد</button><p class="muted spaced">تُطبّق القواعد عند إعادة حساب الخطة. تبقى المهام المكتملة وسجلات المذاكرة محفوظة.</p></form>`;
      }
    } catch (err) {
      if (!disposed)
        target.innerHTML = empty("تعذر تحميل القسم", e(err.message), "error");
      toast(err.message);
    }
  }
  async function editInstructor(id) {
    const r = instructors.find((x) => x.id === id) || {},
      assets = await api("/api/admin/assets");
    if (disposed) return;
    dialog(
      id ? "تعديل المصدر" : "إضافة مدرس أو مصدر",
      `<form id="instructor-editor" data-id="${id || ""}"><div class="form-grid">${field("name", "الاسم", r.name, "text", 'required maxlength="120"')}${select(
        "kind",
        "النوع",
        [
          ["teacher", "مدرّس"],
          ["source", "مصدر تعليمي"],
        ],
        r.kind || "teacher",
      )}${field("specialty", "التخصص", r.specialty)}${select("imageAssetId", "الصورة من المكتبة", [["", "بدون صورة"], ...assets.filter((a) => a.public && a.mime.startsWith("image/") && a.status === "ready").map((a) => [a.id, a.name])], r.imageAssetId || "")}${field("imageUrl", "رابط صورة HTTPS اختياري", r.imageUrl, "url")}</div><div class="field"><label for="la-bio">نبذة تعريفية</label><textarea name="bio" id="la-bio" maxlength="4000">${e(r.bio || "")}</textarea></div><fieldset><legend>الأقسام التي يتخصص فيها</legend>${db.sections.map((s) => `<label class="checkbox"><input name="sectionIds" type="checkbox" value="${s.id}" ${r.sectionIds?.includes(s.id) ? "checked" : ""}><span>${e(s.title)}</span></label>`).join("")}</fieldset><label class="checkbox spaced"><input name="published" type="checkbox" ${r.published ? "checked" : ""}><span>نشر المصدر للطلاب</span></label><button class="btn btn-primary spaced" type="submit">حفظ المصدر</button></form>`,
    );
  }
  function editTrack(id) {
    const t = db.tracks.find((t) => t.id === id) || {};
    dialog(
      id ? "تعديل المسار" : "مسار أو مادة جديدة",
      `<form id="track-editor" data-id="${id || ""}">${field("title", "اسم المسار", t.title, "text", "required")}${select(
        "sectionId",
        "القسم",
        db.sections.map((s) => [s.id, s.title]),
        t.sectionId,
      )}${field("subject", "اسم المادة / الموضوع", t.subject, "text", "required")}${field("order", "الترتيب", t.order || db.tracks.length + 1, "number", 'min="1" required')}<label class="checkbox field"><input type="checkbox" name="visible" ${t.visible !== false ? "checked" : ""}><span>إظهار المسار</span></label><label class="checkbox field"><input type="checkbox" name="coming" ${t.coming ? "checked" : ""}><span>المحتوى قادم</span></label><button class="btn btn-primary" type="submit">حفظ المسار</button></form>`,
    );
  }
  const click = async (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    try {
      if (b.hasAttribute("data-instructor-edit"))
        await editInstructor(b.dataset.instructorEdit);
      if (b.dataset.instructorDelete) {
        if (!confirm("أرشفة المصدر وإخفاؤه مع الحفاظ على دوراته وتقدم الطلاب؟"))
          return;
        await api(
          "/api/admin/learning/instructors/" + b.dataset.instructorDelete,
          { method: "DELETE", body: {} },
        );
        await load();
        toast("أُرشف المصدر دون حذف دوراته.");
      }
      if (b.hasAttribute("data-track-edit")) editTrack(b.dataset.trackEdit);
      if (b.dataset.trackDelete) {
        if (db.courses.some((c) => c.trackId === b.dataset.trackDelete))
          throw Error("المسار مرتبط بدورات. أخفه أو أعد ربطها قبل الحذف.");
        if (!confirm("حذف المسار غير المرتبط بدورات؟")) return;
        db.tracks = db.tracks.filter((t) => t.id !== b.dataset.trackDelete);
        await saveDb();
        await load();
      }
    } catch (err) {
      toast(err.message);
    }
  };
  const submit = async (ev) => {
    const f = ev.target;
    if (
      !["instructor-editor", "track-editor", "scheduler-rules"].includes(f.id)
    )
      return;
    ev.preventDefault();
    const b = f.querySelector("button[type=submit]");
    b.disabled = true;
    try {
      const fd = new FormData(f),
        value = Object.fromEntries(fd);
      if (f.id === "instructor-editor") {
        await api("/api/admin/learning/instructors", {
          method: "POST",
          body: {
            ...value,
            id: f.dataset.id || undefined,
            sectionIds: fd.getAll("sectionIds"),
            published: fd.has("published"),
          },
        });
        modal.close();
        await reloadContent();
        await load();
        toast("حُفظ المصدر على الخادم.");
      }
      if (f.id === "track-editor") {
        const id = f.dataset.id || crypto.randomUUID(),
          t = {
            id,
            title: value.title.trim(),
            subject: value.subject.trim(),
            sectionId: value.sectionId,
            order: Number(value.order),
            visible: fd.has("visible"),
            coming: fd.has("coming"),
          },
          index = db.tracks.findIndex((t) => t.id === id);
        if (index < 0) db.tracks.push(t);
        else db.tracks[index] = t;
        await saveDb();
        modal.close();
        await load();
        toast("حُفظ المسار.");
      }
      if (f.id === "scheduler-rules") {
        await api("/api/admin/learning/rules", {
          method: "PUT",
          body: Object.fromEntries(
            Object.entries(value).map(([k, v]) => [k, Number(v)]),
          ),
        });
        toast("حُفظت قواعد الجدولة.");
      }
    } catch (err) {
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

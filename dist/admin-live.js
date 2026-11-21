import { api, account } from "./api.js";
import { db, escape as e, money, reloadContent } from "./data.js";
import { icon, notice, empty } from "./ui.js";
const field = (name, title, value = "", type = "text", extra = "") =>
  `<div class="field"><label for="a-${name}">${title}</label><input id="a-${name}" name="${name}" type="${type}" value="${e(value ?? "")}" ${extra}></div>`;
const select = (name, title, options, value) =>
  `<div class="field"><label for="a-${name}">${title}</label><select name="${name}" id="a-${name}">${options.map(([id, label]) => `<option value="${e(id)}" ${value === id ? "selected" : ""}>${e(label)}</option>`).join("")}</select></div>`;
const check = (name, title, value) =>
  `<label class="checkbox field"><input type="checkbox" name="${name}" ${value ? "checked" : ""}><span>${title}</span></label>`;
const table = (heads, rows) =>
  `<div class="admin-table-wrap"><table><thead><tr>${heads.map((v) => `<th>${v}</th>`).join("")}</tr></thead><tbody>${rows.join("") || `<tr><td colspan="${heads.length}">لا توجد بيانات بعد.</td></tr>`}</tbody></table></div>`;
const date = (value) => (value ? new Date(value).toLocaleString("ar-SA") : "—");
export function mountAdminLive(tab, toast, render) {
  let disposed = false,
    timer,
    editors = {},
    draft = { scope: "home", html: "", css: "", js: "", height: 400 },
    previewTimer,
    liveSeq = 0,
    activeLanguage = "html";
  const target = document.querySelector("#live-admin-root");
  if (!target) return () => {};
  const error = (err) => {
    if (!disposed) toast(err.message);
  };
  async function load() {
    try {
      if (tab === "overview") {
        const s = await api("/api/admin/stats");
        if (disposed) return;
        target.innerHTML = `<div class="admin-overview-title"><div><span class="eyebrow">صورة واضحة لما يحدث</span><h2>أهلًا ${e(account.user.name)}.</h2><p>أرقام من قاعدة بيانات رُزمة، تتحدث عند فتح هذه الصفحة.</p></div><span class="demo-marker">بيانات فعلية</span></div><div class="admin-metrics">${[
          ["الطلاب", s.students],
          ["المشتركون", s.subscribers],
          ["اشتراكات نشطة", s.active],
          ["اشتراكات منتهية", s.expired],
          ["مدفوعات فعلية", money(s.total / 100) + " ر.س"],
          ["زيارات الصفحات", s.views],
          ["اختبارات مكتملة", s.tests],
          ["طلبات AI الناجحة", s.ai.requests],
        ]
          .map(
            ([title, n]) =>
              `<div class="stat"><span>${title}</span><b>${n}</b></div>`,
          )
          .join(
            "",
          )}</div><h3 class="spaced">آخر عمليات الدفع</h3>${payments(s.payments)}`;
      }
      if (tab === "students") {
        const users = await api(
          "/api/admin/users?q=" +
            encodeURIComponent(
              document.querySelector("#admin-user-search")?.value || "",
            ),
        );
        if (disposed) return;
        if (!document.querySelector("#admin-user-search"))
          target.innerHTML = `<h2>الطلاب والاشتراكات</h2><form id="user-search" class="inline-form"><input id="admin-user-search" name="q" type="search" placeholder="البحث بالاسم أو البريد" aria-label="البحث عن طالب"><button class="btn btn-primary" type="submit">بحث</button></form><div id="user-results" class="spaced"></div>`;
        document.querySelector("#user-results").innerHTML =
          users
            .map(
              (u) =>
                `<details class="user-detail"><summary><div><b>${e(u.name)}</b><small>${e(u.email)}</small></div><span>${u.subscriptions.some((s) => s.status === "active" && s.end_at > new Date().toISOString()) ? "اشتراك نشط" : "بدون اشتراك نشط"}</span>${icon("down")}</summary><div class="user-detail-content"><h3>الاشتراكات</h3><button class="btn btn-light btn-sm" data-student-progress="${u.id}">عرض خطة الطالب وتقدمه</button>${table(
                  ["الباقة", "البداية", "النهاية", "الحالة", ""],
                  u.subscriptions.map(
                    (s) =>
                      `<tr><td>${e(db.plans.find((p) => p.id === s.plan_id)?.title || s.plan_id)}</td><td>${date(s.start_at)}</td><td>${date(s.end_at)}</td><td>${s.status === "active" && s.end_at < new Date().toISOString() ? "منتهٍ" : e(s.status)}</td><td>${s.status === "active" ? `<button class="btn btn-outline btn-sm danger" data-stop-sub="${s.id}">إيقاف</button>` : ""}</td></tr>`,
                  ),
                )}<form class="grant-sub form-grid spaced" data-user="${u.id}">${select(
                  "planId",
                  "الباقة",
                  db.plans.map((p) => [p.id, p.title]),
                  "month",
                )}${field("days", "أيام التفعيل أو التمديد", 30, "number", 'min="1" max="3650" required')}<button class="btn btn-primary" type="submit">تفعيل أو تمديد إداري ${icon("plus")}</button></form><h3 class="spaced">سجل المدفوعات</h3>${payments(u.payments)}</div></details>`,
            )
            .join("") ||
          empty(
            "لم يُسجل طلاب بعد",
            "ستظهر الحسابات عند التسجيل في المنصة.",
            "user",
          );
      }
      if (tab === "leaks") {
        const reports = await api("/api/admin/leaks");
        if (disposed) return;
        const labels = {
          pending: "بانتظار المراجعة",
          approved: "معتمد",
          rejected: "مرفوض",
          needs_changes: "يحتاج تعديلًا",
          hidden: "مخفي",
        };
        target.innerHTML =
          "<h2>مراجعة إفادات الطلاب</h2>" +
          notice("لا تُنشر الإفادة إلا بعد مراجعة الحقوق والخصوصية وصياغة عنوان ووصف عام منقّح. لا تعتمد نصًا حرفيًا أو صورة لسؤال سري.") +
          (reports.length
            ? reports.map((r) => `<article class="panel spaced" data-leak-card="${e(r.id)}"><div class="admin-bar"><div><h3>${e(r.topic)}</h3><small>${e(r.submitter || "حساب محذوف")} · ${date(r.created_at)} · ${e(r.track)} / ${e(r.subject)}</small></div><span class="badge ${r.status === "approved" ? "badge-purple" : ""}">${e(labels[r.status] || r.status)}</span></div><p>${e(r.description)}</p><div class="smalltext">تاريخ التجربة: ${e(r.exam_date || "غير محدد")} · بلاغات: ${r.report_count}</div><div class="form-grid spaced"><div class="field"><label>العنوان العام بعد إزالة أي بيانات شخصية</label><input data-leak-topic value="${e(r.public_topic || r.topic)}" maxlength="100"></div><div class="field"><label>الوصف العام المنقّح قبل النشر</label><textarea data-leak-description maxlength="1200">${e(r.public_description || r.description)}</textarea></div><div class="field"><label>ملاحظة داخلية (اختياري)</label><input data-leak-note value="${e(r.review_note || "")}" maxlength="500"></div></div><div class="table-actions"><button class="btn btn-primary btn-sm" data-leak-review="${e(r.id)}" data-status="approved" ${r.rights_confirmed ? "" : "disabled"}>اعتماد ونشر</button><button class="btn btn-outline btn-sm" data-leak-review="${e(r.id)}" data-status="needs_changes">طلب تعديل</button><button class="btn btn-outline btn-sm danger" data-leak-review="${e(r.id)}" data-status="rejected">رفض</button><button class="btn btn-ghost btn-sm" data-leak-review="${e(r.id)}" data-status="hidden">إخفاء</button></div>${r.rights_confirmed ? "" : '<p class="danger smalltext">لم يؤكد المرسل شروط الحقوق؛ لا يمكن اعتماد المشاركة.</p>'}</article>`).join("")
            : empty("لا توجد مشاركات", "ستظهر هنا إفادات الطلاب الجديدة بعد إرسالها.", "file"));
      }
      if (tab === "community") {
        const data = await api("/api/admin/support");
        if (disposed) return;
        const statusLabels = { pending: "بانتظار الرد", replied: "تم الرد", rejected: "مرفوض", closed: "مغلق" };
        const pending = data.questions.filter((q) => q.status === "pending").length;
        target.innerHTML =
          "<h2>استفسارات الطلاب</h2>" +
          notice("كل استفسار يصل إلى الإدارة فقط. اكتب الرد ثم اختر إن كنت تريد نشر السؤال والرد لجميع الطلاب أم إبقاء الرد خاصًا بصاحب الاستفسار. لا يظهر شيء للعامة قبل حفظ الرد مع تفعيل خيار النشر.") +
          '<div class="admin-metrics"><div class="stat"><span>كل الاستفسارات</span><b>' + data.questions.length + '</b></div><div class="stat"><span>بانتظار الرد</span><b>' + pending + '</b></div><div class="stat"><span>إجابات منشورة</span><b>' + data.questions.filter((q) => q.published && q.status === "replied").length + '</b></div></div>' +
          '<section class="panel spaced"><h3>تصنيفات الاستفسارات</h3><p class="muted">يمكنك تغيير الأسماء أو إيقاف تصنيف أو إضافة تصنيف جديد. التصنيف المتوقف لا يظهر للطلاب عند إرسال سؤال جديد.</p><form id="support-category-form" class="inline-form spaced"><input name="name" maxlength="50" minlength="2" placeholder="اسم تصنيف جديد، مثل: مواعيد الاختبارات" required><button class="btn btn-primary" type="submit">إضافة تصنيف</button></form>' +
          (data.categories.map((c) =>
            '<div class="support-admin-category" data-support-category-card="' + e(c.id) + '"><input data-support-category-name value="' + e(c.name) + '" maxlength="50" aria-label="اسم التصنيف"><label><input type="checkbox" data-support-category-active ' + (c.active ? "checked" : "") + '> نشط</label><button class="btn btn-outline btn-sm" data-support-category-save="' + e(c.id) + '">حفظ</button></div>'
          ).join("") || '<p class="muted">لا توجد تصنيفات.</p>') +
          '</section><section class="support-admin-questions"><h3>صندوق الاستفسارات</h3>' +
          (data.questions.length
            ? data.questions.map((q) =>
                '<article class="panel spaced support-admin-card" data-support-card="' + e(q.id) + '"><div class="admin-bar"><div><span class="badge">' + e(q.category_name) + '</span><h3 class="spaced">' + e(q.subject) + '</h3><small>' + e(q.student_name) + (q.student_email ? " · " + e(q.student_email) : "") + " · " + date(q.created_at) + '</small></div><span class="badge ' + (q.status === "replied" ? "badge-purple" : "") + '">' + e(statusLabels[q.status] || q.status) + '</span></div><p class="support-admin-question">' + e(q.body) + '</p><div class="field"><label>رد إدارة رُزمة</label><textarea data-support-reply rows="4" maxlength="3000" placeholder="اكتب ردًا واضحًا للطالب...">' + e(q.reply || "") + '</textarea></div><label class="checkbox support-publish-option"><input type="checkbox" data-support-publish ' + (q.published ? "checked" : "") + '><span>أوافق على نشر السؤال والرد لجميع الطلاب بعد حفظ الرد</span></label><div class="table-actions"><button class="btn btn-primary btn-sm" data-support-reply="' + e(q.id) + '" ' + (q.status === "rejected" || q.status === "closed" ? "disabled" : "") + '>حفظ الرد</button>' +
                (q.status !== "rejected" ? '<button class="btn btn-outline btn-sm danger" data-support-status="' + e(q.id) + '" data-status="rejected">رفض الاستفسار</button>' : "") +
                (q.status !== "closed" ? '<button class="btn btn-ghost btn-sm" data-support-status="' + e(q.id) + '" data-status="closed">إغلاق</button>' : "") +
                (q.published ? '<span class="support-published-label">' + icon("globe") + " منشور للطلاب</span>" : q.status === "replied" ? '<span class="muted smalltext">الرد خاص بصاحب الاستفسار</span>' : "") +
                '</div></article>'
              ).join("")
            : empty("صندوق الاستفسارات فارغ", "ستظهر هنا أسئلة الطلاب الجديدة، ولن يراها غير الإدارة حتى تراجعها.", "message-circle")) +
          "</section>";
      }
      if (tab === "broadcasts") {
        const history = await api("/api/admin/broadcasts");
        if (disposed) return;
        const labels = { sending: "جارٍ الإرسال", sent: "أُرسلت", partial: "إرسال جزئي", failed: "فشل الإرسال" };
        target.innerHTML = `<h2>رسالة تشغيلية للمشتركين</h2>${notice("تصل الرسالة إلى أصحاب الاشتراكات النشطة فقط ممن أكدوا بريدهم. لا تستخدم هذا القسم للإعلانات التسويقية أو الرسائل غير الضرورية. تتم المعاينة أولًا، ولا يُرسل شيء قبل التأكيد النهائي.", "info")}<form id="broadcast-form" class="panel"><div class="form-grid"><div class="field"><label for="broadcast-subject">عنوان البريد</label><input id="broadcast-subject" name="subject" maxlength="120" required></div><div class="field full"><label for="broadcast-message">نص الرسالة</label><textarea id="broadcast-message" name="message" rows="6" maxlength="4000" minlength="20" placeholder="اكتب تحديثًا مهمًا يخص الاشتراك أو تشغيل المنصة..." required></textarea></div></div>${check("serviceOnly", "أؤكد أن الرسالة تشغيلية ومخصصة للمشتركين الحاليين، وليست إعلانًا تسويقيًا.", false)}<div class="modal-actions"><button class="btn btn-outline" type="button" data-broadcast-preview>معاينة عدد المستلمين</button><button class="btn btn-primary" id="broadcast-send" type="submit" disabled>إرسال بعد التأكيد ${icon("send")}</button></div><div id="broadcast-preview" class="broadcast-preview" role="status" aria-live="polite">لن يتم الإرسال قبل عرض عدد المستلمين.</div><label class="checkbox spaced"><input type="checkbox" name="confirmSend"><span>راجعت عدد المستلمين ونص الرسالة وأوافق على إرسالها الآن.</span></label></form><h3 class="spaced">سجل الرسائل السابقة</h3>${table(["العنوان","المستلمون","المرسل فعليًا","الحالة","التاريخ"],history.map((r)=>`<tr><td>${e(r.subject)}</td><td>${r.recipient_count}</td><td>${r.sent_count}</td><td>${e(labels[r.status]||r.status)}</td><td>${date(r.sent_at||r.created_at)}</td></tr>`))}`;
      }
      if (tab === "uploads") {
        const [assets, storage] = await Promise.all([
          api("/api/admin/assets"),
          api("/api/admin/storage"),
        ]);
        if (disposed) return;
        if (!document.querySelector("#upload-form"))
          target.innerHTML = `<h2>مكتبة الفيديوهات والملفات</h2>${notice(storage.driver === "s3" ? "التخزين السحابي S3/R2. الملفات المدفوعة خاصة، والوصول إليها بروابط قصيرة الصلاحية." : "التخزين الحالي على قرص الخادم. فعّل S3/R2 في إعدادات الاستضافة لاستخدام التخزين السحابي.")}<form id="upload-form" class="panel"><label class="upload-picker" for="upload-file">${icon("upload")}<strong>اختر ملفًا من جهازك</strong><span>فيديو · PDF · PNG · JPG · WebP</span><input id="upload-file" name="file" type="file" accept="video/mp4,video/webm,video/quicktime,image/png,image/jpeg,image/webp,application/pdf" required></label><div class="form-grid spaced">${select("courseId", "الدورة (للربط)", [["", "اختر الدورة"], ...db.courses.map((c) => [c.id, c.title])], "")}${select("lessonId", "الدرس", [["", "اختر الدورة أولًا"]], "")}${select("thumbnailId", "صورة مصغرة للفيديو", [["", "بدون"], ...assets.filter((a) => a.mime.startsWith("image/") && a.status === "ready").map((a) => [a.id, a.name])], "")}${check("public", "إتاحة الصورة للجميع (للشعار والصور المصغرة)", false)}</div><p class="muted">رفع فيديو لدرس مرتبط يستبدل فيديو ذلك الدرس بعد اكتمال المعالجة. يمكنك حذف الملف السابق من المكتبة. الفيديو يتحول إلى MP4 بدقة لا تتجاوز 720p باستخدام FFmpeg.</p><div class="upload-progress hidden" id="upload-progress"><progress max="100" value="0"></progress><span>0٪</span><p role="status"></p></div><div class="admin-bar spaced"><button class="btn btn-primary" type="submit">رفع الملف ${icon("upload")}</button><button class="btn btn-outline" type="button" data-storage-test>اختبار التخزين</button></div></form><div id="asset-list" class="spaced"></div>`;
        document.querySelector("#asset-list").innerHTML = table(
          ["الملف", "الحجم", "الحالة", "الربط", "الإجراءات"],
          assets.map(
            (a) =>
              `<tr><td>${e(a.name)}<br><small>${e(a.mime)}</small>${a.error ? `<p class="danger">${e(a.error)}</p>` : ""}</td><td>${(a.size / 1048576).toFixed(1)} MB</td><td>${e({ uploading: "جارٍ الرفع", processing: "معالجة 720p", ready: "جاهز", failed: "تعذرت المعالجة" }[a.status] || a.status)}</td><td>${e(db.courses.find((c) => c.id === a.course_id)?.title || "غير مرتبط")}<br><small>${e(db.courses.flatMap((c) => c.lessons).find((l) => l.id === a.lesson_id)?.title || "")}</small></td><td><div class="table-actions">${a.status === "ready" ? `${a.mime.startsWith("video/") ? `<span class="badge">${a.duration_seconds ? Math.ceil(a.duration_seconds / 60) + " دقيقة مستخرجة" : "مدة غير معروفة"}</span> <button class="btn btn-outline btn-sm" data-probe-video="${a.id}">استخراج المدة</button>` : ""}<a class="btn btn-outline btn-sm" href="/api/media/${a.id}" target="_blank" rel="noopener noreferrer">فتح</a>` : ""}<button class="btn btn-outline btn-sm danger" data-asset-delete="${a.id}" ${a.status === "processing" ? "disabled" : ""}>حذف</button></div></td></tr>`,
          ),
        );
      }
      if (tab === "ai" || tab === "payment") {
        const s = await api("/api/admin/settings/" + tab);
        if (disposed) return;
        target.innerHTML = tab === "ai" ? aiForm(s) : paymentForm(s);
        if (tab === "ai") {
          const rows = await api("/api/admin/ai/usage");
          if (disposed) return;
          document.querySelector("#ai-usage").innerHTML = table(
            [
              "اليوم",
              "النموذج",
              "الحالة",
              "الطلبات",
              "Input Tokens",
              "Output Tokens",
              "التكلفة التقديرية $",
            ],
            rows.map(
              (r) =>
                `<tr><td>${e(r.day)}</td><td>${e(r.model)}</td><td>${e(r.status)}</td><td>${r.requests}</td><td>${r.inputTokens}</td><td>${r.outputTokens}</td><td>${r.cost === null ? "لم تضبط أسعار التوكنات" : r.cost.toFixed(5)}</td></tr>`,
            ),
          );
        }
      }
      if (tab === "custom") {
        const history = await api("/api/admin/custom");
        if (disposed) return;
        target.innerHTML = `<div class="admin-bar"><h2>التخصيص المتقدم</h2><span class="badge badge-purple">Advanced Customization</span></div>${notice("الأكواد تعمل داخل إطار sandbox مستقل بلا وصول للجلسات أو البيانات أو الشبكة. التخصيص يضيف مساحة معزولة إلى الصفحة؛ لا يعدّل DOM الرئيسي أو بيانات الطلاب.", "lock")}<div class="panel"><div class="form-grid">${select(
          "scope",
          "أين يظهر التخصيص؟",
          [
            ["home", "الرئيسية"],
            ["internal", "كل الصفحات الداخلية"],
            ["all", "كل الصفحات العامة"],
            ["section", "صفحات الأقسام"],
            ["course", "صفحات الدورات"],
            ["lesson", "صفحات الدروس"],
            ["pricing", "الباقات"],
            ["tutor", "المدرس"],
            ["track", "مسارات المواد"],
            ["instructor", "صفحات المدرسين"],
            ["tests", "الاختبارات"],
            ["quiz", "صفحة الاختبار"],
            ["results", "النتائج"],
            ["dashboard", "لوحة الطالب"],
            ["journey", "رحلة الطالب"],
            ["choose", "اختيار الدورات"],
            ["bank", "بنك الأسئلة"],
            ["mistakes", "دفتر الأخطاء"],
            ["tools", "الأدوات"],
            ["updates", "التحديثات"],
            ["about", "من نحن"],
          ],
          draft.scope,
        )}${field("height", "ارتفاع المساحة بالبكسل", draft.height, "number", 'min="180" max="1600"')}</div><div class="editor-toolbar"><div class="editor-tabs">${["html", "css", "js"].map((l) => `<button class="tab ${l === "html" ? "active" : ""}" data-code-tab="${l}">${l === "js" ? "JavaScript" : l.toUpperCase()} Editor</button>`).join("")}</div><div><button class="icon-btn" data-code-tool="search" aria-label="بحث داخل الكود">${icon("search")}</button><button class="icon-btn" data-code-tool="undo" aria-label="تراجع">${icon("undo")}</button><button class="icon-btn" data-code-tool="redo" aria-label="إعادة التعديل">↪</button></div></div>${["html", "css", "js"].map((l) => `<div id="editor-${l}" class="code-editor ${l === "html" ? "" : "hidden"}" dir="ltr"></div>`).join("")}<div class="modal-actions"><button class="btn btn-outline" data-code-save="draft">حفظ مسودة</button><button class="btn btn-primary" data-code-save="publish">نشر التعديلات ${icon("upload")}</button><button class="btn btn-light" data-code-preview>تحديث المعاينة</button></div><p class="muted spaced" id="code-status">المعاينة تتحدث بعد الكتابة. Ctrl/Cmd+F للبحث، وCtrl/Cmd+Z للتراجع.</p><iframe id="code-preview" title="معاينة الأكواد المعزولة" sandbox="allow-scripts" referrerpolicy="no-referrer" class="custom-frame" height="400"></iframe></div><h3 class="spaced">سجل النسخ والرجوع</h3>${table(
          ["التاريخ", "النطاق", "الحالة", "الإجراءات"],
          history.versions.map(
            (v) =>
              `<tr><td>${date(v.created_at)}</td><td>${e(v.scope)}</td><td>${history.active.some((a) => a.version_id === v.id) ? "منشورة حاليًا" : e(v.status)}</td><td><button class="btn btn-outline btn-sm" data-code-load="${v.id}">فتح</button> <button class="btn btn-outline btn-sm" data-code-rollback="${v.id}">استعادة ونشر</button></td></tr>`,
          ),
        )}`;
        const { createEditor } = await import("./assets/editor.bundle.js");
        if (disposed) return;
        for (const lang of ["html", "css", "js"])
          editors[lang] = createEditor(
            document.querySelector("#editor-" + lang),
            lang,
            draft[lang],
            () => {
              clearTimeout(previewTimer);
              previewTimer = setTimeout(() => void preview(), 700);
            },
          );
        void preview();
      }
      if (tab === "audit") {
        const rows = await api("/api/admin/audit");
        if (!disposed)
          target.innerHTML =
            "<h2>سجل الأحداث والتغييرات</h2>" +
            table(
              ["التاريخ", "المنفذ", "الحدث", "العنصر"],
              rows.map(
                (r) =>
                  `<tr><td>${date(r.created_at)}</td><td>${e(r.name || "النظام")}</td><td>${e(r.action)}</td><td>${e(r.target)}</td></tr>`,
              ),
            );
      }
      if (tab === "backups")
        target.innerHTML = `<h2>النسخ الاحتياطية</h2><div class="panel spaced"><h3>نسخة SQLite متسقة</h3><p>نسخ تلقائية حسب BACKUP_INTERVAL_HOURS، وحفظ حسب BACKUP_RETENTION_DAYS. تشمل قاعدة البيانات المحتوى والحسابات والسجل. ملفات الفيديو تحتاج نسخًا أو إصدارًا في حاوية التخزين، وAPP_KEY يُحفظ منفصلًا في مخزن أسرار الاستضافة.</p><button class="btn btn-primary spaced" data-create-backup>إنشاء نسخة الآن ${icon("download")}</button><p id="backup-result" role="status"></p></div>`;
    } catch (err) {
      if (!disposed) {
        target.innerHTML = empty(
          "تعذر تحميل هذا القسم",
          e(err.message),
          "error",
        );
        toast(err.message);
      }
    }
  }
  function payments(rows) {
    return table(
      ["الطالب / الطلب", "الباقة", "المبلغ", "الحالة", "الوضع", "التاريخ"],
      rows.map(
        (r) =>
          `<tr><td>${e(r.name || r.id)}<br><small>${e(r.email || "")}</small></td><td>${e(db.plans.find((p) => p.id === r.plan_id)?.title || r.plan_id)}</td><td>${money(r.amount / 100)} ر.س</td><td>${e(r.status)}</td><td>${r.mode === "test" ? "اختباري" : "فعلي"}</td><td>${date(r.created_at)}</td></tr>`,
      ),
    );
  }
  function secretField(name, title, s) {
    return field(
      name,
      title,
      "",
      "password",
      `autocomplete="new-password" placeholder="${s.hasSecrets?.[name] || s.envKey ? "محفوظ على الخادم — اتركه فارغًا للإبقاء عليه" : "لم يُضبط بعد"}"`,
    );
  }
  function connection(s) {
    return `<div class="connection-state">${s.connection?.verified ? "آخر اختبار ناجح: " + date(s.connection.checkedAt) : "لم يُثبت اتصال ناجح بهذه الإعدادات."}</div>`;
  }
  function aiForm(s) {
    return `<h2>إعدادات المدرس الذكي</h2>${notice("الطلبات ترسل إلى OpenAI Responses API من الخادم. المفتاح مشفّر في قاعدة البيانات بمفتاح APP_KEY أو محفوظ في بيئة الخادم. لا يُعاد إلى المتصفح.")}<form id="settings-form" data-type="ai" class="panel"><div class="form-grid">${select("provider", "AI Provider", [["openai", "OpenAI — Responses API"]], "openai")}${secretField("apiKey", "API Key", s)}${field("model", "Model", s.model, "text", "required")}${field("dailyLimit", "Daily Usage Limit", s.dailyLimit, "number", 'min="1" max="1000" required')}${field("maxTokens", "Max Output Tokens", s.maxTokens, "number", 'min="32" max="16000" required')}${field("temperature", "Temperature — فقط للنماذج المدعومة", s.temperature, "number", 'min="0" max="2" step="0.1"')}${field("inputPrice", "سعر مليون Input Tokens بالدولار (اختياري)", s.inputPrice, "number", 'min="0" step="0.001"')}${field("outputPrice", "سعر مليون Output Tokens بالدولار (اختياري)", s.outputPrice, "number", 'min="0" step="0.001"')}</div><div class="field"><label for="ai-instructions">System Instructions</label><textarea name="instructions" id="ai-instructions" rows="8" maxlength="20000">${e(s.instructions)}</textarea></div><p class="muted">API Configuration: POST https://api.openai.com/v1/responses · store:false · سياق آخر ١٦ رسالة ومحتوى رُزمة المتاح. Temperature تُرسل فقط مع GPT-4.1 وGPT-4o.</p>${check("enabled", "تفعيل الخدمة للمشتركين", s.enabled)}<div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ الإعدادات</button><button type="button" class="btn btn-outline" data-test-connection="ai">Test Connection — طلب حقيقي</button></div>${connection(s)}<div id="settings-status" role="status"></div></form><h3 class="spaced">الاستهلاك</h3><p class="muted">التكلفة تقديرية عند إدخال أسعار النموذج. راجع فاتورة OpenAI للمبلغ النهائي.</p><div id="ai-usage" class="spaced"></div>`;
  }
  function paymentForm(s) {
    return `<h2>إعدادات الدفع وبوابات الدفع</h2>${notice("Stripe موصل فعلي لإنشاء Checkout والتحقق من Webhook. الرابط الخارجي تحويل فقط، ولا يفعّل اشتراكًا تلقائيًا. وضع Test يسجل العملية دون منح وصول إنتاجي.", "lock")}<form id="settings-form" data-type="payment" class="panel"><div class="form-grid">${select(
      "provider",
      "مزود الدفع",
      [
        ["stripe", "Stripe — Checkout + Webhook"],
        ["external", "رابط دفع خارجي"],
      ],
      s.provider,
    )}${field("name", "اسم البوابة", s.name)}${field("externalUrl", "رابط Checkout الخارجي (لوضع الرابط فقط)", s.externalUrl, "url")}${field("publicKey", "Public / Publishable Key", s.publicKey)}${secretField("secretKey", "Secret Key", s)}${secretField("webhookSecret", "Webhook Secret", s)}${select(
      "mode",
      "وضع التشغيل",
      [
        ["test", "Test Mode — اختباري"],
        ["live", "Live Mode — دفع فعلي"],
      ],
      s.mode,
    )}${field("webhookUrl", "عنوان Webhook في حساب Stripe", location.origin + "/api/payments/webhook", "text", "readonly")}${field("successPath", "رابط النجاح", location.origin + s.successPath, "text", "readonly")}${field("cancelPath", "رابط الإلغاء / الفشل", location.origin + s.cancelPath, "text", "readonly")}</div>${check("enabled", "تفعيل بوابة الدفع", s.enabled)}<div class="modal-actions"><button type="submit" class="btn btn-primary">حفظ الإعدادات</button><button type="button" class="btn btn-outline" data-test-connection="payment">اختبار الاتصال</button></div>${connection(s)}<div id="settings-status" role="status"></div></form>`;
  }
  function readCode() {
    return {
      ...draft,
      scope: document.querySelector("[name=scope]").value,
      height: Number(document.querySelector("[name=height]").value),
      ...Object.fromEntries(
        Object.entries(editors).map(([k, v]) => [k, v.value()]),
      ),
    };
  }
  async function preview() {
    if (disposed || !editors.html) return;
    const seq = ++liveSeq;
    try {
      draft = readCode();
      const result = await api("/api/admin/custom/preview", {
        method: "POST",
        body: draft,
      });
      if (disposed || seq !== liveSeq) return;
      const iframe = document.querySelector("#code-preview");
      iframe.src = result.url;
      iframe.height = draft.height;
    } catch (err) {
      error(err);
    }
  }
  const click = async (ev) => {
    try {
      const b = ev.target.closest("button");
      if (!b) return;
      const d = b.dataset;
      if (b.hasAttribute("data-broadcast-preview")) {
        const form = document.querySelector("#broadcast-form");
        if (!form) return;
        const preview = document.querySelector("#broadcast-preview"),
          sendButton = document.querySelector("#broadcast-send"),
          values = Object.fromEntries(new FormData(form));
        values.serviceOnly = form.elements.serviceOnly.checked;
        b.disabled = true;
        sendButton.disabled = true;
        try {
          const result = await api("/api/admin/broadcasts/preview", {
            method: "POST",
            body: values,
          });
          form.dataset.recipientCount = String(result.recipientCount);
          form.dataset.previewToken = result.previewToken;
          preview.textContent = result.recipientCount
            ? "سيتم إرسال «" + result.subject + "» إلى " + result.recipientCount + " مشتركًا نشطًا ببريد مؤكد." + (result.mailConfigured ? "" : " لكن يلزم إعداد Resend في الاستضافة قبل الإرسال.")
            : "لا يوجد مشتركون مؤهلون حاليًا. لم يتم إرسال أي رسالة.";
          sendButton.disabled = !result.recipientCount || !values.serviceOnly || !result.mailConfigured;
        } catch (err) {
          delete form.dataset.recipientCount;
          delete form.dataset.previewToken;
          preview.textContent = err.message;
        } finally {
          b.disabled = false;
        }
        return;
      }
      if (d.leakReview) {
        const card = b.closest("[data-leak-card]");
        if (!card) return;
        b.disabled = true;
        await api("/api/admin/leaks/" + encodeURIComponent(d.leakReview) + "/review", {
          method: "POST",
          body: {
            status: d.status,
            publicTopic: card.querySelector("[data-leak-topic]")?.value || "",
            publicDescription: card.querySelector("[data-leak-description]")?.value || "",
            note: card.querySelector("[data-leak-note]")?.value || "",
          },
        });
        toast(d.status === "approved" ? "تم اعتماد الإفادة بعد تنقيحها." : "تم تحديث حالة المراجعة.");
        await load();
        return;
      }
      if (d.supportReply) {
        const card = b.closest("[data-support-card]");
        if (!card) return;
        b.disabled = true;
        const reply = card.querySelector("[data-support-reply]")?.value || "";
        const publish = !!card.querySelector("[data-support-publish]")?.checked;
        await api("/api/admin/support/questions/" + encodeURIComponent(d.supportReply) + "/reply", {
          method: "POST",
          body: { reply, publish },
        });
        toast(publish ? "تم حفظ الرد ونشر السؤال والإجابة للطلاب." : "تم حفظ الرد بشكل خاص لصاحب الاستفسار.");
        await load();
        return;
      }
      if (d.supportStatus) {
        b.disabled = true;
        await api("/api/admin/support/questions/" + encodeURIComponent(d.supportStatus) + "/status", {
          method: "POST",
          body: { status: d.status },
        });
        toast(d.status === "rejected" ? "تم رفض الاستفسار وإخفاؤه عن الطلاب الآخرين." : "تم إغلاق الاستفسار.");
        await load();
        return;
      }
      if (d.supportCategorySave) {
        const card = b.closest("[data-support-category-card]");
        if (!card) return;
        b.disabled = true;
        await api("/api/admin/support/categories", {
          method: "POST",
          body: {
            id: d.supportCategorySave,
            name: card.querySelector("[data-support-category-name]")?.value || "",
            active: !!card.querySelector("[data-support-category-active]")?.checked,
          },
        });
        toast("تم تحديث التصنيف.");
        await load();
        return;
      }
      if (d.probeVideo) {
        b.disabled = true;
        const meta = await api("/api/admin/assets/" + d.probeVideo + "/probe", {
          method: "POST",
          body: {},
        });
        toast(
          "استُخرجت المدة: " + Math.ceil(meta.durationSeconds / 60) + " دقيقة",
        );
        await reloadContent();
        await load();
      }
      if (d.studentProgress) {
        const p = await api(
          "/api/admin/learning/students/" + d.studentProgress,
        );
        const modal = document.querySelector("#modal");
        modal.innerHTML = `<div class="modal-head"><h2>خطة ${e(p.name)}</h2><button class="icon-btn" data-close aria-label="إغلاق">${icon("close")}</button></div><p>الاختبار: ${e(p.profile.sectionId || "غير محدد")} · ${p.profile.dailyMinutes || 0} دقيقة يوميًا</p><p>الدورات المختارة: ${p.courses.length} · إنجاز اليوم: ${p.today.percent ?? "—"}٪</p>${p.courses.map((c) => `<div class="list-row"><span>${e(c.title)}</span><b>${c.watchedLessons}/${c.lessons} مشاهدة/قراءة</b></div>`).join("")}<h3 class="spaced">دقة الاختبارات — مستقلة عن المشاهدة</h3>${p.mastery.map((m) => `<p>${e(m.trackId)}: ${m.correct}/${m.total}</p>`).join("") || "<p>لا توجد نتائج بعد.</p>"}`;
        modal.showModal();
      }
      if (d.storageTest !== undefined) {
        toast("جارٍ اختبار التخزين…");
        const r = await api("/api/admin/storage/test", {
          method: "POST",
          body: {},
        });
        toast(
          r.driver === "s3"
            ? "نجح اختبار حاوية التخزين السحابي."
            : "التخزين المحلي متاح على الخادم.",
        );
      }
      if (d.assetDelete) {
        if (
          !confirm("حذف هذا الملف نهائيًا؟ لن يعمل أي درس مرتبط به بعد الحذف.")
        )
          return;
        await api("/api/admin/assets/" + d.assetDelete, {
          method: "DELETE",
          body: {},
        });
        await load();
        toast("تم حذف الملف");
      }
      if (d.stopSub) {
        if (!confirm("إيقاف هذا الاشتراك؟")) return;
        await api("/api/admin/subscriptions/" + d.stopSub, {
          method: "DELETE",
          body: {},
        });
        await load();
        toast("تم إيقاف الاشتراك");
      }
      if (d.testConnection) {
        b.disabled = true;
        document.querySelector("#settings-status").textContent =
          "جارٍ تنفيذ طلب اختبار حقيقي…";
        try {
          const r = await api("/api/admin/" + d.testConnection + "/test", {
            method: "POST",
            body: {},
          });
          document.querySelector("#settings-status").textContent = r.message;
        } catch (err) {
          document.querySelector("#settings-status").textContent = err.message;
        } finally {
          b.disabled = false;
        }
      }
      if (d.createBackup !== undefined) {
        const r = await api("/api/admin/backup", { method: "POST", body: {} });
        document.querySelector("#backup-result").textContent =
          r.message + " — " + r.file;
      }
      if (d.codeTab) {
        activeLanguage = d.codeTab;
        for (const l of ["html", "css", "js"])
          document
            .querySelector("#editor-" + l)
            .classList.toggle("hidden", l !== d.codeTab);
        document
          .querySelectorAll("[data-code-tab]")
          .forEach((x) => x.classList.toggle("active", x === b));
      }
      if (d.codeTool) editors[activeLanguage]?.[d.codeTool]();
      if (d.codePreview !== undefined) await preview();
      if (d.codeSave) {
        draft = readCode();
        await api("/api/admin/custom", {
          method: "POST",
          body: { ...draft, publish: d.codeSave === "publish" },
        });
        toast(
          d.codeSave === "publish" ? "نُشر التخصيص للزوار." : "حُفظت المسودة.",
        );
        for (const v of Object.values(editors)) v.destroy();
        editors = {};
        await load();
      }
      if (d.codeLoad) {
        const v = await api("/api/admin/custom/" + d.codeLoad);
        draft = v;
        for (const [l, editor] of Object.entries(editors)) editor.set(v[l]);
        document.querySelector("[name=scope]").value = v.scope;
        document.querySelector("[name=height]").value = v.height;
        await preview();
      }
      if (d.codeRollback) {
        if (!confirm("استعادة ونشر هذه النسخة للتخصيص؟")) return;
        await api("/api/admin/custom/" + d.codeRollback, {
          method: "POST",
          body: {},
        });
        toast("تمت استعادة النسخة ونشرها.");
        for (const v of Object.values(editors)) v.destroy();
        editors = {};
        await load();
      }
    } catch (err) {
      error(err);
    }
  };
  const settingsDirty = (ev) => {
    const broadcastForm = ev.target.closest("#broadcast-form");
    if (tab === "broadcasts" && broadcastForm && ["subject", "message"].includes(ev.target.name)) {
      delete broadcastForm.dataset.recipientCount;
      delete broadcastForm.dataset.previewToken;
      const sendButton = document.querySelector("#broadcast-send"),
        preview = document.querySelector("#broadcast-preview");
      if (sendButton) sendButton.disabled = true;
      if (preview) preview.textContent = "تغير نص الرسالة؛ أعد معاينة عدد المستلمين.";
    }
    const form = ev.target.closest("#settings-form");
    if (!form) return;
    const test = form.querySelector("[data-test-connection]");
    if (test) test.disabled = true;
    const status = form.querySelector("#settings-status");
    if (status)
      status.textContent =
        "احفظ التغييرات أولًا، ثم اختبر الاتصال بالإعدادات المحفوظة.";
  };
  const change = (ev) => {
    if (tab === "broadcasts" && ev.target.closest("#broadcast-form") && ["subject", "message", "serviceOnly"].includes(ev.target.name)) {
      const form = document.querySelector("#broadcast-form");
      delete form.dataset.recipientCount;
      delete form.dataset.previewToken;
      const sendButton = document.querySelector("#broadcast-send"),
        preview = document.querySelector("#broadcast-preview");
      if (sendButton) sendButton.disabled = true;
      if (preview) preview.textContent = "تغيرت الرسالة؛ أعد معاينة عدد المستلمين.";
    }
    if (ev.target.name === "courseId" && tab === "uploads") {
      const c = db.courses.find((c) => c.id === ev.target.value);
      document.querySelector("[name=lessonId]").innerHTML =
        '<option value="">بدون ربط بدرس</option>' +
        (c?.lessons || [])
          .map((l) => `<option value="${l.id}">${e(l.title)}</option>`)
          .join("");
    }
    if (["scope", "height"].includes(ev.target.name) && tab === "custom")
      void preview();
  };
  const submit = async (ev) => {
    const form = ev.target;
    if (
      !["settings-form", "upload-form", "user-search", "broadcast-form", "support-category-form"].includes(form.id) &&
      !form.matches(".grant-sub")
    )
      return;
    ev.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(form));
      if (form.id === "support-category-form") {
        await api("/api/admin/support/categories", {
          method: "POST",
          body: { name: values.name, active: true },
        });
        toast("تمت إضافة التصنيف.");
        await load();
      }
      if (form.id === "broadcast-form") {
        const recipientCount = Number(form.dataset.recipientCount);
        if (!recipientCount)
          throw Error("اعرض عدد المستلمين أولًا قبل الإرسال.");
        if (!form.elements.serviceOnly.checked || !form.elements.confirmSend.checked)
          throw Error("أكد أن الرسالة تشغيلية وراجع عدد المستلمين قبل الإرسال.");
        if (!confirm("سيتم إرسال هذه الرسالة إلى " + recipientCount + " مشتركًا نشطًا ببريد مؤكد. هل تريد المتابعة؟"))
          return;
        const result = await api("/api/admin/broadcasts/send", {
          method: "POST",
          body: {
            subject: values.subject,
            message: values.message,
            serviceOnly: true,
            confirmCount: recipientCount,
            previewToken: form.dataset.previewToken,
          },
        });
        toast("اكتمل إرسال " + result.sentCount + " من " + result.recipientCount + " رسالة.");
        await load();
      }
      if (form.id === "settings-form") {
        values.enabled = new FormData(form).has("enabled");
        await api("/api/admin/settings/" + form.dataset.type, {
          method: "PUT",
          body: values,
        });
        toast("حُفظت الإعدادات. اختبر الاتصال قبل الاعتماد عليها.");
        await load();
      }
      if (form.matches(".grant-sub")) {
        await api("/api/admin/subscriptions", {
          method: "POST",
          body: {
            ...values,
            userId: form.dataset.user,
            days: Number(values.days),
          },
        });
        toast("تم تفعيل أو تمديد الاشتراك.");
        await load();
      }
      if (form.id === "user-search") await load();
      if (form.id === "upload-form") {
        const file = form.file.files[0];
        if (!file) throw Error("اختر ملفًا");
        const progress = document.querySelector("#upload-progress");
        progress.classList.remove("hidden");
        const bar = progress.querySelector("progress"),
          percent = progress.querySelector("span"),
          status = progress.querySelector("p");
        status.textContent = "تجهيز الرفع…";
        const upload = await api("/api/admin/assets/init", {
          method: "POST",
          body: {
            name: file.name,
            mime: file.type || "application/octet-stream",
            size: file.size,
            courseId: values.courseId,
            lessonId: values.lessonId,
            thumbnailId: values.thumbnailId,
            public: new FormData(form).has("public"),
          },
        });
        const parts = [];
        const sendPart = (url, blob, offset, type) =>
          new Promise((resolve, reject) => {
            const x = new XMLHttpRequest();
            x.open("PUT", url);
            if (type) x.setRequestHeader("Content-Type", type);
            if (upload.driver === "local") {
              x.withCredentials = true;
              x.setRequestHeader("X-CSRF-Token", account.csrf);
            }
            x.upload.onprogress = (event) => {
              const n = Math.round(((offset + event.loaded) / file.size) * 100);
              bar.value = n;
              percent.textContent = n + "٪";
              status.textContent = "جارٍ رفع " + file.name;
            };
            x.onload = () =>
              x.status >= 200 && x.status < 300
                ? resolve(x.getResponseHeader("ETag"))
                : reject(
                    Error("فشل رفع الملف. تحقق من CORS وصلاحيات التخزين."),
                  );
            x.onerror = () => reject(Error("انقطع الاتصال أثناء الرفع."));
            x.send(blob);
          });
        if (upload.driver === "local")
          await sendPart(upload.uploadUrl, file, 0, file.type);
        else
          for (let i = 0; i < upload.urls.length; i++) {
            const start = i * upload.partSize,
              etag = await sendPart(
                upload.urls[i],
                file.slice(start, Math.min(file.size, start + upload.partSize)),
                start,
                upload.urls.length === 1 ? file.type : null,
              );
            parts.push({ PartNumber: i + 1, ETag: etag });
          }
        status.textContent = "تأكيد اكتمال الرفع…";
        const done = await api("/api/admin/assets/" + upload.id + "/complete", {
          method: "POST",
          body: { parts },
        });
        if (
          values.courseId &&
          (values.lessonId ||
            (file.type.startsWith("image/") &&
              new FormData(form).has("public")))
        )
          await api("/api/admin/assets/" + upload.id + "/link", {
            method: "POST",
            body: {
              courseId: values.courseId,
              lessonId: values.lessonId,
              thumbnailId: values.thumbnailId,
            },
          });
        await reloadContent();
        bar.value = 100;
        percent.textContent = "١٠٠٪";
        status.textContent =
          done.status === "processing"
            ? "اكتمل الرفع. جارٍ تحويل الفيديو إلى 720p؛ يمكنك متابعة حالته في المكتبة."
            : "اكتمل رفع الملف وأصبح جاهزًا.";
        toast("تم رفع الملف.");
        await load();
      }
    } catch (err) {
      error(err);
      const status = document.querySelector("#upload-progress p");
      if (status) status.textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
  document.addEventListener("input", settingsDirty);
  document.addEventListener("click", click);
  document.addEventListener("submit", submit);
  document.addEventListener("change", change);
  void load();
  if (tab === "uploads") timer = setInterval(() => void load(), 5000);
  return () => {
    disposed = true;
    clearInterval(timer);
    clearTimeout(previewTimer);
    for (const v of Object.values(editors)) v.destroy();
    document.removeEventListener("input", settingsDirty);
    document.removeEventListener("click", click);
    document.removeEventListener("submit", submit);
    document.removeEventListener("change", change);
  };
}

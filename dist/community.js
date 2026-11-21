import { api, account } from "./api.js";
import { escape as e } from "./data.js";
import { icon, notice, empty } from "./ui.js";

const trackNames = { qudrat: "القدرات", tahsili: "التحصيلي" };
const subjectNames = {
  quantitative: "كمي",
  verbal: "لفظي",
  math: "رياضيات",
  physics: "فيزياء",
  chemistry: "كيمياء",
  biology: "أحياء",
  other: "عام",
};
const reasonNames = [
  ["spam", "محتوى مزعج"],
  ["inappropriate", "محتوى غير مناسب"],
  ["wrong", "معلومة مضللة"],
  ["privacy", "خصوصية أو بيانات شخصية"],
  ["other", "سبب آخر"],
];
const dateLabel = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "الآن"
    : date.toLocaleDateString("ar-SA", { day: "numeric", month: "short", year: "numeric" });
};

export function communityPage() {
  return '<section class="community-page"><div class="page-heading"><span class="eyebrow">نتعلم مع بعض</span><h1>مجتمع رُزمة</h1><p>اسأل عن فكرة، شارك طريقة الحل، وساعد زملاءك. المشاركات التعليمية هنا من الطلاب وليست أسئلة رسمية.</p></div><div id="community-root"><div class="dash-skeleton"><span></span><span></span><span></span></div></div></section>';
}

export function mountCommunity(toast, postId = "") {
  const root = document.querySelector("#community-root");
  if (!root) return () => {};
  let disposed = false;
  let posts = [];
  let post = null;
  let answers = [];
  let showComposer = false;
  let filters = { track: "all", subject: "all", q: "" };

  const fail = (err) => {
    if (!disposed) toast(err.message || "تعذر تنفيذ العملية.");
  };
  const reportForm = (type, id) =>
    '<details class="community-report"><summary>إبلاغ</summary><form class="community-report-form" data-target-type="' +
    type +
    '" data-target-id="' +
    e(id) +
    '"><select name="reason" aria-label="سبب الإبلاغ">' +
    reasonNames.map(([value, label]) => '<option value="' + value + '">' + label + "</option>").join("") +
    '</select><button class="btn btn-outline btn-sm" type="submit">إرسال البلاغ</button></form></details>';

  function composer() {
    return '<form id="community-create-form" class="panel community-form spaced"><div class="panel-head"><div><span class="eyebrow">سؤال جديد</span><h2>وش حاب تسأل؟</h2></div></div><p class="muted">اكتب سؤالًا واضحًا من صياغتك، ولا تضع بيانات شخصية أو تنسخ أسئلة سرية أو محمية.</p><div class="form-grid"><div class="field"><label for="community-track">المسار</label><select id="community-track" name="track" required><option value="qudrat">القدرات</option><option value="tahsili">التحصيلي</option></select></div><div class="field"><label for="community-subject">التصنيف</label><select id="community-subject" name="subject" required><option value="quantitative">كمي</option><option value="verbal">لفظي</option><option value="math">رياضيات</option><option value="physics">فيزياء</option><option value="chemistry">كيمياء</option><option value="biology">أحياء</option><option value="other">عام</option></select></div><div class="field full"><label for="community-title">عنوان السؤال</label><input id="community-title" name="title" maxlength="120" minlength="5" placeholder="مثال: كيف أحل مسائل التناسب العكسي؟" required></div><div class="field full"><label for="community-body">تفاصيل السؤال</label><textarea id="community-body" name="body" rows="4" maxlength="2000" minlength="10" placeholder="اكتب محاولتك أو الجزء الذي لم تفهمه..." required></textarea></div></div><div class="modal-actions"><button class="btn btn-primary" type="submit">نشر السؤال ' + icon("send") + '</button><button class="btn btn-outline" type="button" data-community-new>إلغاء</button></div></form>';
  }

  function renderFeed() {
    const rows = posts.map((item) =>
      '<article class="community-post panel"><div class="community-post-top"><div class="community-meta"><span class="badge badge-purple">' +
      e(trackNames[item.track] || item.track) +
      '</span><span class="badge">' +
      e(subjectNames[item.subject] || item.subject) +
      '</span></div><time>' +
      dateLabel(item.last_answer_at || item.updated_at || item.created_at) +
      '</time></div><a class="community-post-link" href="#/community/' +
      e(item.id) +
      '"><h3>' +
      e(item.title) +
      '</h3><p>' +
      e(item.body.length > 180 ? item.body.slice(0, 180) + "…" : item.body) +
      '</p></a><div class="community-post-foot"><span>' +
      icon("user") +
      " " +
      e(item.author_name) +
      '</span><span>' +
      icon("message-circle") +
      " " +
      item.answer_count +
      " إجابة" +
      (item.accepted_answer_id ? ' · <b class="community-accepted-label">تم اختيار أفضل إجابة</b>' : "") +
      '</span><a class="text-link" href="#/community/' +
      e(item.id) +
      '">افتح النقاش ' +
      icon("arrow") +
      "</a></div></article>"
    ).join("");
    root.innerHTML =
      '<div class="community-toolbar"><div class="community-filters"><label>المسار<select id="community-filter-track"><option value="all">كل المسارات</option><option value="qudrat">القدرات</option><option value="tahsili">التحصيلي</option></select></label><label>التصنيف<select id="community-filter-subject"><option value="all">كل التصنيفات</option>' +
      Object.entries(subjectNames).map(([value, label]) => '<option value="' + value + '">' + label + "</option>").join("") +
      '</select></label><label class="community-search">ابحث<input id="community-search" type="search" value="' +
      e(filters.q) +
      '" placeholder="كلمة من السؤال"></label></div><button class="btn btn-primary" type="button" data-community-new>' +
      icon("plus") +
      " اطرح سؤالًا</button></div>" +
      (showComposer ? composer() : "") +
      '<div class="section-heading community-section-heading"><div><h2>أسئلة الطلاب</h2><p>نقاشات تعليمية بين المشتركين</p></div><span class="badge">' +
      posts.length +
      " سؤالًا</span></div>" +
      (rows || empty("لا توجد أسئلة مطابقة", "كن أول من يطرح سؤالًا أو غيّر خيارات البحث.", "message-circle"));
    root.querySelector("#community-filter-track").value = filters.track;
    root.querySelector("#community-filter-subject").value = filters.subject;
  }

  function renderDetail() {
    if (!post) {
      root.innerHTML = empty("السؤال غير متاح", "قد يكون صاحبه حذفه أو أخفته الإدارة.", "message-circle", '<a class="btn btn-outline" href="#/community">العودة للمجتمع</a>');
      return;
    }
    const isOwner = post.user_id === account.user?.id;
    const answerCards = answers.map((item) =>
      '<article class="community-answer panel ' +
      (item.accepted ? "is-accepted" : "") +
      '"><div class="community-answer-top"><div><b>' +
      e(item.author_name) +
      '</b><time>' +
      dateLabel(item.created_at) +
      '</time></div>' +
      (item.accepted ? '<span class="badge badge-purple">' + icon("check-circle") + " أفضل إجابة</span>" : "") +
      '</div><p>' +
      e(item.body) +
      '</p><div class="community-answer-actions">' +
      (isOwner && !item.accepted ? '<button class="btn btn-outline btn-sm" data-community-accept="' + e(item.id) + '">اعتماد كأفضل إجابة</button>' : "") +
      reportForm("answer", item.id) +
      "</div></article>"
    ).join("");
    root.innerHTML =
      '<a class="text-link community-back" href="#/community">' +
      icon("arrow-right") +
      ' العودة إلى مجتمع رُزمة</a><article class="panel community-question"><div class="community-meta"><span class="badge badge-purple">' +
      e(trackNames[post.track] || post.track) +
      '</span><span class="badge">' +
      e(subjectNames[post.subject] || post.subject) +
      '</span></div><h2>' +
      e(post.title) +
      '</h2><p class="community-question-body">' +
      e(post.body) +
      '</p><div class="community-post-foot"><span>' +
      icon("user") +
      " " +
      e(post.author_name) +
      '</span><time>' +
      dateLabel(post.created_at) +
      "</time>" +
      reportForm("post", post.id) +
      '</div></article><div class="section-heading community-section-heading"><div><h2>الإجابات والنقاش</h2><p>شارك طريقة الحل باحترام ووضوح</p></div><span class="badge">' +
      answers.length +
      " إجابة</span></div>" +
      (answerCards || empty("لا توجد إجابات بعد", "ابدأ بمساعدة صاحب السؤال.", "message-circle")) +
      '<form id="community-answer-form" class="panel community-form spaced"><h3>أضف إجابتك</h3><label for="community-answer">إجابتك</label><textarea id="community-answer" name="body" rows="4" maxlength="1500" minlength="2" placeholder="اشرح فكرتك أو خطوات الحل..." required></textarea><div class="modal-actions"><button class="btn btn-primary" type="submit">إرسال الإجابة ' +
      icon("send") +
      "</button></div></form>";
  }

  async function loadFeed() {
    try {
      const query = new URLSearchParams({
        track: filters.track,
        subject: filters.subject,
        q: filters.q,
      });
      posts = await api("/api/community/posts?" + query.toString());
      if (!disposed) renderFeed();
    } catch (err) {
      if (!disposed) root.innerHTML = empty("تعذر تحميل المجتمع", e(err.message), "error");
    }
  }

  async function loadPost() {
    try {
      const result = await api("/api/community/posts/" + encodeURIComponent(postId));
      if (disposed) return;
      post = result.post;
      answers = result.answers || [];
      renderDetail();
    } catch (err) {
      if (!disposed) root.innerHTML = empty("تعذر تحميل السؤال", e(err.message), "error", '<a class="btn btn-outline" href="#/community">العودة للمجتمع</a>');
    }
  }

  async function submit(ev) {
    const form = ev.target;
    if (form.id === "community-create-form") {
      ev.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        const result = await api("/api/community/posts", { method: "POST", body: values });
        toast("نُشر سؤالك في مجتمع رُزمة.");
        location.hash = "#/community/" + result.id;
      } catch (err) {
        button.disabled = false;
        fail(err);
      }
    }
    if (form.id === "community-answer-form") {
      ev.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        await api("/api/community/posts/" + encodeURIComponent(postId) + "/answers", { method: "POST", body: values });
        toast("أُضيفت إجابتك.");
        await loadPost();
      } catch (err) {
        button.disabled = false;
        fail(err);
      }
    }
    if (form.matches(".community-report-form")) {
      ev.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        const values = Object.fromEntries(new FormData(form));
        await api("/api/community/reports", {
          method: "POST",
          body: { targetType: form.dataset.targetType, targetId: form.dataset.targetId, reason: values.reason },
        });
        form.innerHTML = '<span class="smalltext">وصل البلاغ إلى إدارة رُزمة.</span>';
        toast("وصل بلاغك إلى الإدارة.");
      } catch (err) {
        button.disabled = false;
        fail(err);
      }
    }
  }

  async function click(ev) {
    const button = ev.target.closest("button");
    if (!button) return;
    if (button.hasAttribute("data-community-new")) {
      showComposer = !showComposer;
      renderFeed();
      return;
    }
    if (button.dataset.communityAccept) {
      button.disabled = true;
      try {
        await api("/api/community/posts/" + encodeURIComponent(postId) + "/accept", {
          method: "POST",
          body: { answerId: button.dataset.communityAccept },
        });
        toast("تم اختيار أفضل إجابة.");
        await loadPost();
      } catch (err) {
        button.disabled = false;
        fail(err);
      }
    }
  }

  async function change(ev) {
    if (ev.target.id === "community-filter-track") {
      filters.track = ev.target.value;
      await loadFeed();
    }
    if (ev.target.id === "community-filter-subject") {
      filters.subject = ev.target.value;
      await loadFeed();
    }
  }

  function input(ev) {
    if (ev.target.id !== "community-search") return;
    filters.q = ev.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadFeed(), 250);
  }
  let searchTimer;
  root.addEventListener("click", click);
  root.addEventListener("submit", submit);
  root.addEventListener("change", change);
  root.addEventListener("input", input);
  if (postId) void loadPost();
  else void loadFeed();
  return () => {
    disposed = true;
    clearTimeout(searchTimer);
    root.removeEventListener("click", click);
    root.removeEventListener("submit", submit);
    root.removeEventListener("change", change);
    root.removeEventListener("input", input);
  };
}

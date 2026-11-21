import { randomUUID } from "node:crypto";
import { cleanText, fail } from "./security.mjs";

function requireStudentAccess(store, user) {
  if (!user) fail(401, "سجّل الدخول لإرسال استفسار إلى رُزمة.");
  if (user.role !== "admin" && !store.entitled(user))
    fail(403, "خدمة اسأل رُزمة متاحة للمشتركين النشطين.");
}

export function listSupportCategories(store, user) {
  requireStudentAccess(store, user);
  return store.db.prepare(
    "SELECT id,name FROM support_categories WHERE active=1 ORDER BY sort_order,name"
  ).all();
}

export function createSupportQuestion(store, user, input) {
  requireStudentAccess(store, user);
  const categoryId = cleanText(input.categoryId || "", 80);
  const subject = cleanText(input.subject || "", 120);
  const body = cleanText(input.body || "", 1800);
  const category = store.db.prepare(
    "SELECT id FROM support_categories WHERE id=? AND active=1"
  ).get(categoryId);
  if (!category) fail(400, "اختر تصنيفًا متاحًا.");
  if (subject.length < 4 || body.length < 10)
    fail(400, "اكتب عنوانًا واضحًا وتفاصيل كافية لاستفسارك.");
  const id = randomUUID();
  const timestamp = new Date().toISOString();
  store.db.prepare(
    "INSERT INTO support_questions(id,user_id,category_id,subject,body,status,published,created_at,updated_at) VALUES(?,?,?,?,?,'pending',0,?,?)"
  ).run(id, user.id, categoryId, subject, body, timestamp, timestamp);
  store.audit(user.id, "support.question.create", id, { categoryId });
  return { id, status: "pending", created_at: timestamp };
}

export function listStudentSupportQuestions(store, user) {
  requireStudentAccess(store, user);
  return store.db.prepare(
    "SELECT q.id,q.category_id,c.name AS category_name,q.subject,q.body,q.reply,q.status,q.published,q.created_at,q.updated_at,q.replied_at " +
    "FROM support_questions q JOIN support_categories c ON c.id=q.category_id " +
    "WHERE q.user_id=? ORDER BY q.created_at DESC LIMIT 100"
  ).all(user.id);
}

export function listPublishedSupportAnswers(store, user, categoryId = "all") {
  requireStudentAccess(store, user);
  const where = ["q.status='replied'", "q.published=1"];
  const params = [];
  if (categoryId && categoryId !== "all") {
    where.push("q.category_id=?");
    params.push(cleanText(categoryId, 80));
  }
  return store.db.prepare(
    "SELECT q.id,q.category_id,c.name AS category_name,q.subject,q.body,q.reply,q.replied_at " +
    "FROM support_questions q JOIN support_categories c ON c.id=q.category_id " +
    "WHERE " + where.join(" AND ") + " ORDER BY q.replied_at DESC LIMIT 100"
  ).all(...params);
}

export function listSupportForAdmin(store) {
  return {
    categories: store.db.prepare(
      "SELECT id,name,active,sort_order FROM support_categories ORDER BY sort_order,name"
    ).all(),
    questions: store.db.prepare(
      "SELECT q.id,q.user_id,q.category_id,c.name AS category_name,q.subject,q.body,q.reply,q.status,q.published,q.created_at,q.updated_at,q.replied_at," +
      "COALESCE(u.name,'حساب محذوف') AS student_name,COALESCE(u.email,'') AS student_email " +
      "FROM support_questions q JOIN support_categories c ON c.id=q.category_id " +
      "LEFT JOIN users u ON u.id=q.user_id ORDER BY CASE q.status WHEN 'pending' THEN 0 WHEN 'replied' THEN 1 WHEN 'closed' THEN 2 ELSE 3 END,q.updated_at DESC LIMIT 300"
    ).all(),
  };
}

export function replySupportQuestion(store, user, id, input) {
  const reply = cleanText(input.reply || "", 3000);
  const publish = input.publish === true;
  if (reply.length < 2) fail(400, "اكتب الرد قبل الحفظ.");
  const question = store.db.prepare(
    "SELECT id,user_id,status FROM support_questions WHERE id=?"
  ).get(id);
  if (!question) fail(404, "الاستفسار غير موجود.");
  if (question.status === "rejected" || question.status === "closed")
    fail(409, "لا يمكن الرد على استفسار مرفوض أو مغلق.");
  const timestamp = new Date().toISOString();
  store.db.prepare(
    "UPDATE support_questions SET reply=?,status='replied',published=?,replied_by=?,replied_at=?,updated_at=? WHERE id=?"
  ).run(reply, publish ? 1 : 0, user.id, timestamp, timestamp, id);
  store.audit(user.id, "support.question.reply", id, { published: publish });
  return { ok: true, status: "replied", published: publish };
}

export function updateSupportQuestionStatus(store, user, id, input) {
  const status = cleanText(input.status || "", 20);
  if (!["pending", "rejected", "closed"].includes(status))
    fail(400, "حالة الاستفسار غير صحيحة.");
  const result = store.db.prepare(
    "UPDATE support_questions SET status=?,published=0,updated_at=? WHERE id=?"
  ).run(status, new Date().toISOString(), id);
  if (!result.changes) fail(404, "الاستفسار غير موجود.");
  store.audit(user.id, "support.question.status", id, { status });
  return { ok: true, status };
}

export function upsertSupportCategory(store, user, input) {
  const id = cleanText(input.id || "", 80);
  const name = cleanText(input.name || "", 50);
  const active = input.active !== false;
  if (name.length < 2) fail(400, "اكتب اسمًا واضحًا للتصنيف.");
  if (id) {
    const result = store.db.prepare(
      "UPDATE support_categories SET name=?,active=? WHERE id=?"
    ).run(name, active ? 1 : 0, id);
    if (!result.changes) fail(404, "التصنيف غير موجود.");
    store.audit(user.id, "support.category.update", id, { active });
    return { id, name, active };
  }
  const newId = randomUUID();
  const max = store.db.prepare(
    "SELECT COALESCE(max(sort_order),0)+1 AS n FROM support_categories"
  ).get().n;
  store.db.prepare(
    "INSERT INTO support_categories(id,name,active,sort_order,created_at) VALUES(?,?,?, ?,?)"
  ).run(newId, name, active ? 1 : 0, max, new Date().toISOString());
  store.audit(user.id, "support.category.create", newId, { active });
  return { id: newId, name, active };
}
